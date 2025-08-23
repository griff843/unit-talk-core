#!/usr/bin/env tsx
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';
import { getConfig } from '@unit-talk/config';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

async function main() {
  const cfg = getConfig();
  const sql = postgres(cfg.DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (id INT PRIMARY KEY, name TEXT, filename TEXT, applied_at TIMESTAMPTZ DEFAULT now())`;
    const appliedRows = await sql`SELECT id FROM _migrations ORDER BY id`;
    const applied = new Set<number>(appliedRows.map((r: any) => r.id));
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    for (const f of files) {
      const m = f.match(/^(\d+)_([^.]+)\.sql$/);
      if (!m) continue;
      const id = parseInt(m[1], 10);
      const name = m[2];
      if (applied.has(id)) continue;
      const sqlText = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
      await sql.begin(async s => {
        await s.unsafe(sqlText);
        await s`INSERT INTO _migrations (id, name, filename) VALUES (${id}, ${name}, ${f})`;
      });
      console.log('Applied', f);
    }
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
