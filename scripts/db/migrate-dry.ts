#!/usr/bin/env tsx
import 'dotenv/config';
import { getConfig } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';
import postgres from 'postgres';

async function main() {
  const cfg = getConfig();
  const sql = postgres(cfg.DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (id INT PRIMARY KEY, name TEXT, filename TEXT, applied_at TIMESTAMPTZ DEFAULT now())`;
    const applied = await sql`SELECT id, filename FROM _migrations ORDER BY id`;
    console.log('Applied migrations:', applied);
    console.log('Pending migrations: inspect ./migrations directory');
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
