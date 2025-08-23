#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function main() {
  const outDir = path.join(process.cwd(), 'out', 'acceptance');
  fs.mkdirSync(outDir, { recursive: true });

  const result: any = {
    ok: false,
    timestamp: new Date().toISOString(),
    details: {},
  };
  try {
    execSync('npm run db:index:audit', { stdio: 'inherit' });
    execSync('npm run db:migrate:up', { stdio: 'inherit' });
    execSync('npm run db:index:audit', { stdio: 'inherit' });
    result.ok = true;
  } catch (e: any) {
    result.error = e?.message || String(e);
  }
  fs.writeFileSync(
    path.join(outDir, 'db-hygiene.json'),
    JSON.stringify(result, null, 2)
  );
  process.exit(result.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
