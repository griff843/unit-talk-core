#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '@unit-talk/observability';
import { getPgPoolDirect } from '../shared/db';

// Output shape specified by requirements
interface VerifyShapeOutput {
  ok: boolean;
  tables: { raw_props: boolean; unified_picks: boolean };
  columns: {
    'raw_props.inserted_at': boolean;
    'raw_props.processed_at': boolean;
    'unified_picks.promoted_at': boolean;
    'unified_picks.raw_id': boolean;
  };
  indexes: {
    idx_raw_props_inserted_at: boolean;
    idx_raw_props_processed_at: boolean;
    idx_unified_picks_promoted_at: boolean;
    idx_unified_picks_raw_id: boolean;
  };
  reason?: string;
  timestamp: string;
}

async function queryViaSupabase(sql: string): Promise<any[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or service key');
  }
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      apikey: serviceKey,
    } as Record<string, string>,
    body: JSON.stringify({ sql }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`exec_sql HTTP ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'out', 'db');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'verify-shape.json');

  const result: VerifyShapeOutput = {
    ok: false,
    tables: { raw_props: false, unified_picks: false },
    columns: {
      'raw_props.inserted_at': false,
      'raw_props.processed_at': false,
      'unified_picks.promoted_at': false,
      'unified_picks.raw_id': false,
    },
    indexes: {
      idx_raw_props_inserted_at: false,
      idx_raw_props_processed_at: false,
      idx_unified_picks_promoted_at: false,
      idx_unified_picks_raw_id: false,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    // Preferred: query via Supabase exec_sql
    try {
      const tablesRows = await queryViaSupabase(
        "select table_name from information_schema.tables where table_schema='public' and table_name in ('raw_props','unified_picks')"
      );
      const tableNames = new Set<string>(
        tablesRows.map((r: any) => r.table_name)
      );
      result.tables.raw_props = tableNames.has('raw_props');
      result.tables.unified_picks = tableNames.has('unified_picks');

      const colsRows = await queryViaSupabase(
        "select table_name||'.'||column_name as name from information_schema.columns where table_schema='public' and ((table_name='raw_props' and column_name in ('inserted_at','processed_at')) or (table_name='unified_picks' and column_name in ('promoted_at','raw_id')))"
      );
      const colNames = new Set<string>(colsRows.map((r: any) => r.name));
      result.columns['raw_props.inserted_at'] = colNames.has(
        'raw_props.inserted_at'
      );
      result.columns['raw_props.processed_at'] = colNames.has(
        'raw_props.processed_at'
      );
      result.columns['unified_picks.promoted_at'] = colNames.has(
        'unified_picks.promoted_at'
      );
      result.columns['unified_picks.raw_id'] = colNames.has(
        'unified_picks.raw_id'
      );

      const idxRows = await queryViaSupabase(
        "select indexname from pg_indexes where schemaname='public' and tablename in ('raw_props','unified_picks')"
      );
      const indexNames = new Set<string>(idxRows.map((r: any) => r.indexname));
      result.indexes.idx_raw_props_inserted_at = indexNames.has(
        'idx_raw_props_inserted_at'
      );
      result.indexes.idx_raw_props_processed_at = indexNames.has(
        'idx_raw_props_processed_at'
      );
      result.indexes.idx_unified_picks_promoted_at = indexNames.has(
        'idx_unified_picks_promoted_at'
      );
      result.indexes.idx_unified_picks_raw_id = indexNames.has(
        'idx_unified_picks_raw_id'
      );

      result.ok = true;
    } catch (supabaseError) {
      // Fallback: direct pg
      const pool = getPgPoolDirect();
      const client = await pool.connect();
      try {
        const tablesRes = await client.query(
          "select table_name from information_schema.tables where table_schema='public' and table_name in ('raw_props','unified_picks')"
        );
        const tableNames = new Set<string>(
          tablesRes.rows.map(r => r.table_name)
        );
        result.tables.raw_props = tableNames.has('raw_props');
        result.tables.unified_picks = tableNames.has('unified_picks');

        const colsRes = await client.query(
          "select table_name||'.'||column_name as name from information_schema.columns where table_schema='public' and ((table_name='raw_props' and column_name in ('inserted_at','processed_at')) or (table_name='unified_picks' and column_name in ('promoted_at','raw_id')))"
        );
        const colNames = new Set<string>(colsRes.rows.map((r: any) => r.name));
        result.columns['raw_props.inserted_at'] = colNames.has(
          'raw_props.inserted_at'
        );
        result.columns['raw_props.processed_at'] = colNames.has(
          'raw_props.processed_at'
        );
        result.columns['unified_picks.promoted_at'] = colNames.has(
          'unified_picks.promoted_at'
        );
        result.columns['unified_picks.raw_id'] = colNames.has(
          'unified_picks.raw_id'
        );

        const idxRes = await client.query(
          "select indexname from pg_indexes where schemaname='public' and tablename in ('raw_props','unified_picks')"
        );
        const indexNames = new Set<string>(
          idxRes.rows.map((r: any) => r.indexname)
        );
        result.indexes.idx_raw_props_inserted_at = indexNames.has(
          'idx_raw_props_inserted_at'
        );
        result.indexes.idx_raw_props_processed_at = indexNames.has(
          'idx_raw_props_processed_at'
        );
        result.indexes.idx_unified_picks_promoted_at = indexNames.has(
          'idx_unified_picks_promoted_at'
        );
        result.indexes.idx_unified_picks_raw_id = indexNames.has(
          'idx_unified_picks_raw_id'
        );

        result.ok = true;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.ok = false;
    result.reason = msg;
    logger.error('verify-shape failed', { error: msg });
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
