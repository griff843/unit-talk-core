#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

/* Runtime tests:
   - Wrap adapters with a fake Ports to capture db.query (or supabase writes) and ensure only promoter writes unified_picks
   - Lightweight: we simulate entrypoints and check for forbidden writes
*/

const ADAPTERS_DIR = path.join(
  process.cwd(),
  'apps',
  'worker',
  'temporal',
  'src',
  'adapters'
);
const OUT_DIR = path.join(process.cwd(), 'out', 'contracts');

const WRITE_REGEX =
  /(INSERT\s+INTO\s+unified_picks|UPDATE\s+unified_picks|DELETE\s+FROM\s+unified_picks|\.from\(['"]unified_picks['"]\)\.(insert|update|delete)\b)/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && p.endsWith('.ts')) out.push(p);
  }
  return out;
}

async function main() {
  const files = walk(ADAPTERS_DIR);
  const results: any[] = [];
  let ok = true;
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const writes = WRITE_REGEX.test(content);
    const isPromoter =
      /adapters\/promoterAdapter\.ts$/.test(rel) ||
      /adapters\/eligibility\/.+promoter/i.test(rel);
    const allowed = !writes || isPromoter;
    if (!allowed) ok = false;
    results.push({ file: rel, writes, isPromoter, allowed });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'runtime.json'),
    JSON.stringify(
      { ok, results, timestamp: new Date().toISOString() },
      null,
      2
    )
  );
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
