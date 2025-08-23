# DB Verification Scripts

These Windows-safe Node/TS scripts provide quick checks for DB posture.

- Shape verifier: `npm run db:verify:shape`
  - Checks that public.raw_props and public.unified_picks exist
  - Validates columns in raw_props (id, data, type, source, is_canary, inserted_at, processed_at)
  - Detects optional columns in unified_picks (id, raw_id, promoted_at)
  - Confirms indexes on raw_props: idx_raw_props_inserted_at, idx_raw_props_processed_at
  - Writes out/db/verify-shape.json

- Session verifier: `npm run db:verify:session`
  - Uses withSession() to set app.role and app.tenant_id
  - Reads current session settings and does a minimal read on raw_props
  - Writes out/db/verify-session.json

