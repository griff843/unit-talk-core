#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const shadow = process.env.SHADOW_MODE !== 'false';
  const out: any = {
    ok: true,
    timestamp: new Date().toISOString(),
    live: true,
    shadow: false,
  };

  if (shadow) {
    out.ok = true;
    out.shadow = true;
    out.note = 'SHADOW_MODE=true; skipping live Supabase probe';
  } else {
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !service || !anon) {
      out.ok = false;
      out.error =
        'SUPABASE_URL, SUPABASE_SERVICE_KEY, or SUPABASE_ANON_KEY missing';
    } else {
      try {
        const admin = createClient(url, service, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        // Confirm unified_picks exists by selecting with service role
        const { error: existsErr } = await admin
          .from('unified_picks')
          .select('id')
          .limit(1);
        if (
          existsErr &&
          String(existsErr.message || '')
            .toLowerCase()
            .includes('does not exist')
        ) {
          out.ok = false;
          out.error = 'unified_picks table missing';
        } else {
          out.tableExists = true;
        }
        // Test policy (RLS) by attempting an insert with anon key; should fail
        const anonClient = createClient(url, anon, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: policyErr2 } = await anonClient
          .from('unified_picks')
          .insert({ raw_id: '00000000-0000-0000-0000-000000000000' } as any);
        out.policy_blocks_anon_write = !!policyErr2;
        out.rls_enabled = out.policy_blocks_anon_write === true;
        out.ok = !!out.tableExists && !!out.rls_enabled;
      } catch (e: any) {
        out.ok = false;
        out.error = e?.message || String(e);
      }
    }
  }

  const outDir = path.join(process.cwd(), 'out', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'supabase-live.json'),
    JSON.stringify(out, null, 2)
  );
  process.exit(out.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
