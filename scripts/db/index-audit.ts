#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { getConfig } from '@unit-talk/config';

async function main() {
  const cfg = getConfig();
  const sql = postgres(cfg.DATABASE_URL);
  const outDir = path.join(process.cwd(), 'out', 'db');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const list =
      await sql`SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2`;
    fs.writeFileSync(
      path.join(outDir, 'indexes.before.txt'),
      JSON.stringify(list, null, 2)
    );
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
