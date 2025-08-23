#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function readJson(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; }
}

function main() {
  const outDir = path.join(process.cwd(), 'out', 'quality');
  fs.mkdirSync(outDir, { recursive: true });

  const exposure = readJson('out/ops/exposure.json');
  const freeze = readJson('out/ops/freeze.json');
  const slo = readJson('out/ops/slo.json');
  const drift = readJson('out/ops/drift.json');

  const lines = [];
  lines.push('# CI Operational Summary');
  lines.push('');
  if (exposure) {
    lines.push('## Exposure');
    lines.push(`- breaches: ${exposure.breaches?.length ?? 0}`);
    if (Array.isArray(exposure.caps)) lines.push(`- caps: ${exposure.caps.join(', ')}`);
    lines.push('');
  }
  if (freeze) {
    lines.push('## Freeze');
    lines.push(`- status: ${freeze.status ?? 'unknown'}`);
    if (freeze.reason) lines.push(`- reason: ${freeze.reason}`);
    lines.push('');
  }
  if (slo) {
    lines.push('## SLO');
    if (slo.p50) lines.push(`- p50: ${slo.p50}`);
    if (slo.p95) lines.push(`- p95: ${slo.p95}`);
    if (slo.burn_rate) lines.push(`- burn-rate: ${slo.burn_rate}`);
    lines.push('');
  }
  if (drift) {
    lines.push('## Drift');
    if (Array.isArray(drift.highlights)) {
      for (const h of drift.highlights) lines.push(`- ${h}`);
    } else {
      lines.push('- none');
    }
    lines.push('');
  }

  // Links to artifacts if present
  const smokePaths = ['out/smoke/temporal.json','out/smoke/supabase.json','out/smoke/db.json','out/smoke/discord.json'];
  const links = smokePaths.filter(p => fs.existsSync(p));
  if (links.length) {
    lines.push('## Smoke Artifacts');
    for (const p of links) lines.push(`- ${p}`);
    lines.push('');
  }

  fs.writeFileSync(path.join(outDir, 'last-ci-summary.md'), lines.join('\n'));
}

main();

