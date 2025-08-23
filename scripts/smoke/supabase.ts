#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_KEY;
  const out: any = { ok: false, timestamp: new Date().toISOString() };

  if (!url || !service) {
    out.error = 'SUPABASE_URL or SUPABASE_SERVICE_KEY missing';
  } else {
    try {
      const admin = createClient(url, service, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await admin.from('unified_picks').select('id').limit(1);
      if (
        error &&
        !String(error.message || '')
          .toLowerCase()
          .includes('permission')
      ) {
        // table missing or other errors should be reported
        out.error = error.message;
      } else {
        out.ok = true;
      }
    } catch (e: any) {
      out.error = e?.message || String(e);
    }
  }

  const outDir = path.join(process.cwd(), 'out', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'supabase.json'),
    JSON.stringify(out, null, 2)
  );
  process.exit(out.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
