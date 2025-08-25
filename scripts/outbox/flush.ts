#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

(async () => {
  const out = join(process.cwd(), 'out', 'ops', 'outbox.json');
  const data = {
    timestamp: new Date().toISOString(),
    pendingCount: Number(process.env.OUTBOX_PENDING || 0),
    lastFlushAt: new Date().toISOString(),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`Wrote ${out}`);
})();

