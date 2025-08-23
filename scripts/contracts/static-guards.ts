#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import fs from 'fs';
import path from 'path';

/* Static guards:
   - Only promoter adapter may write to unified_picks
   - packages/logic/** must not import fs, path, http, https, express, @supabase/*, pg, discord.js nor use process.env
*/

const ADAPTERS_DIR = path.join(
  process.cwd(),
  'apps',
  'worker',
  'temporal',
  'src',
  'adapters'
);
const LOGIC_DIR = path.join(process.cwd(), 'packages', 'logic');
const OUT_DIR = path.join(process.cwd(), 'out', 'contracts');

const WRITE_PATTERNS = [
  /\.from\(['"]unified_picks['"]\)\.(insert|update|delete)\b/,
  /\bINSERT\s+INTO\s+unified_picks\b/i,
  /\bUPDATE\s+unified_picks\b/i,
  /\bDELETE\s+FROM\s+unified_picks\b/i,
];

const FORBIDDEN_IMPORTS = [
  /\bfrom\s+['"]fs['"]/,
  /\bfrom\s+['"]path['"]/,
  /\bfrom\s+['"]http['"]/,
  /\bfrom\s+['"]https['"]/,
  /\bfrom\s+['"]express['"]/,
  /\bfrom\s+['"]@supabase\//,
  /\bfrom\s+['"]pg['"]/,
  /\bfrom\s+['"]discord\.js['"]/,
];

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else if (
      e.isFile() &&
      (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js'))
    )
      files.push(p);
  }
  return files;
}

function scanAdapters() {
  const violations: Array<{ file: string; reason: string; line?: number }> = [];
  if (!fs.existsSync(ADAPTERS_DIR)) return violations;
  const files = walk(ADAPTERS_DIR);
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const isPromoter =
      /adapters\/promoterAdapter\.ts$/.test(rel) ||
      /adapters\/eligibility\/.+promoter/i.test(rel);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const pat of WRITE_PATTERNS) {
        if (pat.test(line)) {
          if (!isPromoter) {
            violations.push({
              file: rel,
              reason: 'Write to unified_picks outside promoter adapter',
              line: idx + 1,
            });
          }
        }
      }
    });
  }
  return violations;
}

function scanLogic() {
  const violations: Array<{ file: string; reason: string; line?: number }> = [];
  if (!fs.existsSync(LOGIC_DIR)) return violations;
  const files = walk(LOGIC_DIR);
  for (const file of files) {
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');

    // Skip test files, disabled files, and config files
    if (
      rel.includes('/__tests__/') ||
      rel.endsWith('.disabled.ts') ||
      rel.endsWith('.eslintrc.js') ||
      rel.endsWith('.eslintrc.json') ||
      rel.endsWith('tsconfig.json') ||
      rel.includes('/jest.config.')
    ) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const pat of FORBIDDEN_IMPORTS) {
        if (pat.test(line))
          violations.push({
            file: rel,
            reason: 'Forbidden import',
            line: idx + 1,
          });
      }
      if (/process\.env\b/.test(line))
        violations.push({
          file: rel,
          reason: 'Forbidden process.env usage',
          line: idx + 1,
        });
    });
  }
  return violations;
}

function main() {
  const adapterViolations = scanAdapters();
  const logicViolations = scanLogic();
  const out = {
    ok: adapterViolations.length === 0 && logicViolations.length === 0,
    adapterViolations,
    logicViolations,
    timestamp: new Date().toISOString(),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'static.json'),
    JSON.stringify(out, null, 2)
  );
  if (!out.ok) {
    console.error('Static contracts violations detected');
    process.exit(1);
  }
}

main();
