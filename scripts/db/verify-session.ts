#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '@unit-talk/observability';
import { withSession } from '../shared/db';

// Output shape specified by requirements
interface VerifySessionOutput {
  ok: boolean;
  app_role?: string | null;
  app_tenant?: string | null;
  can_read_raw_props?: boolean;
  reason?: string;
  timestamp: string;
}

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'out', 'db');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'verify-session.json');

  const result: VerifySessionOutput = {
    ok: false,
    app_role: null,
    app_tenant: null,
    can_read_raw_props: undefined,
    timestamp: new Date().toISOString(),
  };

  try {
    await withSession(async client => {
      // Read current session variables
      const r = await client.query(
        "select current_setting('app.role', true) as app_role, current_setting('app.tenant_id', true) as app_tenant"
      );
      const row = r.rows[0] || {};
      result.app_role = row.app_role ?? null;
      result.app_tenant = row.app_tenant ?? null;

      // Minimal read to confirm RLS permits select in shadow mode
      try {
        const q = await client.query(
          'select id from public.raw_props order by inserted_at desc limit 1'
        );
        void q;
        result.can_read_raw_props = true;
      } catch (e) {
        logger.warn('RLS read from raw_props failed', {
          error: e instanceof Error ? e.message : String(e),
        });
        result.can_read_raw_props = false;
      }
    });

    result.ok = true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Acceptable: e.g. "Tenant or user not found"
    result.ok = false;
    result.reason = msg;
    logger.error('verify-session failed', { error: msg });
  } finally {
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`Wrote ${outPath}`);
  }
}

main().catch(err => {
  // Non-blocking: always exit 0; write already handled
  console.error(err);
  process.exit(0);
});
