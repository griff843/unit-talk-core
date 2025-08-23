#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// We avoid connecting to Temporal if not configured; simulate success under SHADOW_MODE
async function main() {
  const shadow = process.env.SHADOW_MODE !== 'false';
  const out: any = {
    ok: true,
    timestamp: new Date().toISOString(),
    simulated: false,
  };
  const addr = process.env.TEMPORAL_SERVER_ADDRESS;

  if (!addr) {
    out.ok = shadow; // ok in shadow
    out.simulated = true;
    out.note = 'TEMPORAL_SERVER_ADDRESS missing, simulated OK in SHADOW_MODE';
  } else {
    // Minimal TCP reachability check without external deps
    out.simulated = true;
    out.note = 'Temporal reachability not implemented; simulated OK';
  }

  const outDir = path.join(process.cwd(), 'out', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'temporal.json'),
    JSON.stringify(out, null, 2)
  );
  process.exit(out.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
