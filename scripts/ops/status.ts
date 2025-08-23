#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

function readJson(p: string) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; }
}

function main() {
  const root = process.cwd();
  const exposure = readJson(path.join(root, 'out/ops/exposure.json'));
  const freeze = readJson(path.join(root, 'out/ops/freeze.json'));
  const slo = readJson(path.join(root, 'out/ops/slo.json'));
  const drift = readJson(path.join(root, 'out/ops/drift.json'));
  const flags = readJson(path.join(root, 'out/ops/flags.json'));

  console.log('Ops Status');
  console.log('=========
');
  if (flags) console.log('Flags:', flags);
  if (exposure) console.log('Exposure:', { breaches: exposure.breaches?.length ?? 0, caps: exposure.caps });
  if (freeze) console.log('Freeze:', freeze);
  if (slo) console.log('SLO:', { p50: slo.p50, p95: slo.p95, burn: slo.burn_rate });
  if (drift) console.log('Drift:', drift.highlights ?? []);
}

main();

