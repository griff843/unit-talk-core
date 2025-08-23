#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';
import { OpsReport as OpsReportSchema } from './schema';
import type { OpsReport, Breach } from './schema';

// Import functions if available; otherwise fallback to spawning via child_process
import { runParityCheck } from './parity-check';
import { runRlsWatch } from './rls-watch';
import { runTemporalHealth } from './temporal-health';

const TIMEOUT_MS = 60_000;

async function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    return result as T;
  } finally {
    clearTimeout(timer!);
  }
}

async function main() {
  const started = Date.now();

  const [parity, rls, temporal] = await Promise.all([
    withTimeout(runParityCheck(), TIMEOUT_MS, 'parity-check'),
    withTimeout(runRlsWatch(), TIMEOUT_MS, 'rls-watch'),
    withTimeout(runTemporalHealth(), TIMEOUT_MS, 'temporal-health'),
  ]).catch(async (err) => {
    // If any hard error, record as a high severity breach
    const now = Date.now();
    const report: OpsReport = {
      ok: false,
      breaches: [
        { name: 'ops-execution-error', severity: 'high', details: { message: (err as Error).message } },
      ],
      runtime_ms: now - started,
      timestamp: new Date().toISOString(),
      components: {},
    };
    await writeReport(report);
    console.log(`OPS: ok=false, breaches=[ops-execution-error]`);
    process.exit(1);
  }) as any;

  const components: OpsReport['components'] = {
    parity: { ok: parity.ok, details: parity.details },
    rls: { ok: rls.ok, violations: rls.violations },
    temporal: { ok: temporal.ok, backlog_age_sec: temporal.backlog_age_sec, failures: temporal.failures },
  };

  const breaches: Breach[] = [] as unknown as Breach[];
  if (!parity.ok) breaches.push({ name: 'parity-breach', severity: 'high', details: parity } as any);
  if (!rls.ok || (rls.violations && rls.violations > 0))
    breaches.push({ name: 'rls-violations', severity: 'med', details: rls } as any);
  if (!temporal.ok || (temporal.backlog_age_sec && temporal.backlog_age_sec > 300) || (temporal.failures && temporal.failures > 0))
    breaches.push({ name: 'temporal-health', severity: 'med', details: temporal } as any);

  const ok = breaches.length === 0;
  const report: OpsReport = {
    ok,
    breaches,
    runtime_ms: Date.now() - started,
    timestamp: new Date().toISOString(),
    components,
  };

  // Validate report
  const parsed = OpsReportSchema.safeParse(report);
  if (!parsed.success) {
    console.error('Ops report failed schema validation:', parsed.error.issues);
    process.exit(1);
  }

  await writeReport(report);
  console.log(`OPS: ok=${ok}, breaches=[${breaches.map((b) => (b as any).name).join(', ')}]`);
  process.exit(ok ? 0 : 1);
}

async function writeReport(report: OpsReport) {
  const outDir = path.join(process.cwd(), 'out', 'ops');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ops.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('Unexpected error in ops-all:', err);
  process.exit(1);
});

