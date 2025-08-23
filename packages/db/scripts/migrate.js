#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const postgres_1 = __importDefault(require("postgres"));
const config_1 = require("@unit-talk/config");
const observability_1 = require("@unit-talk/observability");
const MIGRATIONS_DIR = (0, path_1.join)(process.cwd(), '../../migrations');
function loadMigrations() {
    try {
        const files = (0, fs_1.readdirSync)(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort();
        return files.map(filename => {
            const match = filename.match(/^(\d+)_(.+)\.sql$/);
            if (!match) {
                throw new Error(`Invalid migration filename: ${filename}`);
            }
            const [, idStr, name] = match;
            const id = parseInt(idStr, 10);
            const content = (0, fs_1.readFileSync)((0, path_1.join)(MIGRATIONS_DIR, filename), 'utf8');
            return { id, name, filename, content };
        });
    }
    catch (error) {
        observability_1.logger.error('Failed to load migrations', {
            error: error instanceof Error ? error.message : String(error),
            migrationsDir: MIGRATIONS_DIR,
        });
        throw error;
    }
}
async function createMigrationsTable(sql) {
    await sql `
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
    observability_1.logger.info('Migrations table ensured');
}
async function getAppliedMigrations(sql) {
    const result = await sql `
    SELECT id FROM _migrations ORDER BY id
  `;
    return result.map(row => row.id);
}
async function applyMigration(sql, migration) {
    observability_1.logger.info(`Applying migration: ${migration.filename}`);
    await sql.begin(async (sql) => {
        // Execute migration content
        await sql.unsafe(migration.content);
        // Record migration as applied
        await sql `
      INSERT INTO _migrations (id, name, filename)
      VALUES (${migration.id}, ${migration.name}, ${migration.filename})
    `;
    });
    observability_1.logger.info(`Migration applied: ${migration.filename}`);
}
async function removeMigration(sql, migration) {
    observability_1.logger.info(`Removing migration: ${migration.filename}`);
    await sql `
    DELETE FROM _migrations WHERE id = ${migration.id}
  `;
    observability_1.logger.info(`Migration removed from tracking: ${migration.filename}`);
}
async function migrateUp() {
    const config = (0, config_1.getConfig)();
    const sql = (0, postgres_1.default)(config.DATABASE_URL);
    try {
        await createMigrationsTable(sql);
        const migrations = loadMigrations();
        const applied = await getAppliedMigrations(sql);
        const pending = migrations.filter(m => !applied.includes(m.id));
        if (pending.length === 0) {
            observability_1.logger.info('No pending migrations');
            return;
        }
        observability_1.logger.info(`Found ${pending.length} pending migrations`);
        for (const migration of pending) {
            await applyMigration(sql, migration);
        }
        observability_1.logger.info('All migrations applied successfully');
    }
    finally {
        await sql.end();
    }
}
async function migrateDown() {
    const config = (0, config_1.getConfig)();
    const sql = (0, postgres_1.default)(config.DATABASE_URL);
    try {
        const migrations = loadMigrations();
        const applied = await getAppliedMigrations(sql);
        if (applied.length === 0) {
            observability_1.logger.info('No migrations to rollback');
            return;
        }
        const lastApplied = Math.max(...applied);
        const migration = migrations.find(m => m.id === lastApplied);
        if (!migration) {
            throw new Error(`Migration with id ${lastApplied} not found`);
        }
        await removeMigration(sql, migration);
        observability_1.logger.info(`Rolled back migration: ${migration.filename}`);
    }
    finally {
        await sql.end();
    }
}
async function dryRun() {
    const config = (0, config_1.getConfig)();
    const sql = (0, postgres_1.default)(config.DATABASE_URL);
    try {
        await createMigrationsTable(sql);
        const migrations = loadMigrations();
        const applied = await getAppliedMigrations(sql);
        const pending = migrations.filter(m => !applied.includes(m.id));
        observability_1.logger.info('Migration status:');
        observability_1.logger.info(`Applied: ${applied.length}`);
        observability_1.logger.info(`Pending: ${pending.length}`);
        if (pending.length > 0) {
            observability_1.logger.info('Pending migrations:');
            pending.forEach(m => {
                observability_1.logger.info(`  - ${m.filename}`);
            });
        }
    }
    finally {
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
        observability_1.logger.error('Migration failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map