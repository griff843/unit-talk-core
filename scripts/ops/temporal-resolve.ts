#!/usr/bin/env tsx
/* eslint-env node */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
  const outDir = join(process.cwd(), 'out', 'ops');
  const outFile = join(outDir, 'temporal-resolved.json');
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const candidates = [
    process.env.TEMPORAL_ADDRESS,
    '127.0.0.1:7233',
    'localhost:7233',
    'temporal:7233',
  ].filter(Boolean) as string[];

  let selected = candidates[0] || '127.0.0.1:7233';
  // Keep it simple: prefer explicit env, else localhost

  const payload = {
    timestamp: new Date().toISOString(),
    namespace,
    selected,
    candidates,
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Resolved Temporal address: ${selected}`);
}

main().catch((e) => {
  console.error('temporal-resolve failed:', e);
  process.exit(0);
});

