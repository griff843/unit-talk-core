#!/usr/bin/env tsx

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';
import { getConfig } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';

const MIGRATIONS_DIR = join(process.cwd(), '../../migrations');

interface Migration {
  id: number;
  name: string;
  filename: string;
  content: string;
}

function loadMigrations(): Migration[] {
  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }

      const [, idStr, name] = match;
      const id = parseInt(idStr, 10);
      const content = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');

      return { id, name, filename, content };
    });
  } catch (error) {
    logger.error('Failed to load migrations', { 
      error: error instanceof Error ? error.message : String(error),
      migrationsDir: MIGRATIONS_DIR 
    });
    throw error;
  }
}

async function createMigrationsTable(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  logger.info('Migrations table ensured');
}

async function getAppliedMigrations(sql: postgres.Sql): Promise<number[]> {
  const result = await sql`
    SELECT id FROM _migrations ORDER BY id
  `;
  return result.map(row => row.id as number);
}

async function applyMigration(sql: postgres.Sql, migration: Migration): Promise<void> {
  logger.info(`Applying migration: ${migration.filename}`);
  
  await sql.begin(async sql => {
    // Execute migration content
    await sql.unsafe(migration.content);
    
    // Record migration as applied
    await sql`
      INSERT INTO _migrations (id, name, filename)
      VALUES (${migration.id}, ${migration.name}, ${migration.filename})
    `;
  });
  
  logger.info(`Migration applied: ${migration.filename}`);
}

async function removeMigration(sql: postgres.Sql, migration: Migration): Promise<void> {
  logger.info(`Removing migration: ${migration.filename}`);
  
  await sql`
    DELETE FROM _migrations WHERE id = ${migration.id}
  `;
  
  logger.info(`Migration removed from tracking: ${migration.filename}`);
}

async function migrateUp(): Promise<void> {
  const config = getConfig();
  const sql = postgres(config.DATABASE_URL);

  try {
    await createMigrationsTable(sql);
    const migrations = loadMigrations();
    const applied = await getAppliedMigrations(sql);

    const pending = migrations.filter(m => !applied.includes(m.id));
    
    if (pending.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    logger.info(`Found ${pending.length} pending migrations`);

    for (const migration of pending) {
      await applyMigration(sql, migration);
    }

    logger.info('All migrations applied successfully');
  } finally {
    await sql.end();
  }
}

async function migrateDown(): Promise<void> {
  const config = getConfig();
  const sql = postgres(config.DATABASE_URL);

  try {
    const migrations = loadMigrations();
    const applied = await getAppliedMigrations(sql);

    if (applied.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }

    const lastApplied = Math.max(...applied);
    const migration = migrations.find(m => m.id === lastApplied);

    if (!migration) {
      throw new Error(`Migration with id ${lastApplied} not found`);
    }

    await removeMigration(sql, migration);
    logger.info(`Rolled back migration: ${migration.filename}`);
  } finally {
    await sql.end();
  }
}

async function dryRun(): Promise<void> {
  const config = getConfig();
  const sql = postgres(config.DATABASE_URL);

  try {
    await createMigrationsTable(sql);
    const migrations = loadMigrations();
    const applied = await getAppliedMigrations(sql);

    const pending = migrations.filter(m => !applied.includes(m.id));
    
    logger.info('Migration status:');
    logger.info(`Applied: ${applied.length}`);
    logger.info(`Pending: ${pending.length}`);
    
    if (pending.length > 0) {
      logger.info('Pending migrations:');
      pending.forEach(m => {
        logger.info(`  - ${m.filename}`);
      });
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'up':
      await migrateUp();
      break;
    case 'down':
      await migrateDown();
      break;
    case 'dry-run':
      await dryRun();
      break;
    default:
      console.error('Usage: tsx migrate.ts <up|down|dry-run>');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    logger.error('Migration failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  });
}