#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  const out = {
    ok: false,
    timestamp: new Date().toISOString(),
    rls_enabled: false,
  } as any;

  if (!url) {
    out.error = 'DATABASE_URL missing';
  } else {
    const sql = postgres(url, { max: 1 });
    try {
      const res = await sql`SELECT 1 as one`;
      out.select1 = res?.[0]?.one === 1;
      // Check RLS on unified_picks
      const rls =
        await sql`SELECT relrowsecurity as rls FROM pg_class WHERE relname = 'unified_picks'`;
      out.rls_enabled = !!rls?.[0]?.rls;
      out.ok = !!out.select1 && !!out.rls_enabled;
    } catch (e: any) {
      out.error = e?.message || String(e);
    } finally {
      await sql.end();
    }
  }

  const outDir = path.join(process.cwd(), 'out', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'db.json'), JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
