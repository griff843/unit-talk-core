#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import fs from 'fs';
import path from 'path';
import type { WorkflowService } from '@temporalio/client';
import { Connection } from '@temporalio/client';

async function main() {
  const shadow = process.env.SHADOW_MODE !== 'false';
  const out: { ok: boolean; timestamp: string; live: true; shadow: boolean; endpoint?: string; taskQueue?: string; pollers?: number | null; error?: string; note?: string } = {
    ok: true,
    timestamp: new Date().toISOString(),
    live: true,
    shadow: false,
  };

  if (shadow) {
    out.ok = true;
    out.shadow = true;
    out.note = 'SHADOW_MODE=true; skipping live Temporal ping';
  } else {
    const address = process.env.TEMPORAL_SERVER_ADDRESS;
    const taskQueue = process.env.TEMPORAL_TASK_QUEUE;
    if (!address || !taskQueue) {
      out.ok = false;
      out.error = 'Missing TEMPORAL_SERVER_ADDRESS or TEMPORAL_TASK_QUEUE';
    } else {
      try {
        const conn = await Connection.connect({ address });
        const svc = conn.service as WorkflowService;
        const info = await svc.describeTaskQueue({
          taskQueue: { name: taskQueue },
          taskQueueType: 1, // WORKFLOW
        });
        out.ok = true;
        out.taskQueue = taskQueue;
        out.pollers = info.pollers?.length ?? 0;
        await conn.close();
      } catch (e: any) {
        out.ok = false;
        out.error = e?.message || String(e);
      }
    }
  }

  const outDir = path.join(process.cwd(), 'out', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'temporal-live.json'),
    JSON.stringify(out, null, 2)
  );
  process.exit(out.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
