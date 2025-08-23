#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

/**
 * Column Probe Script - Step 2: Schema Validation
 * 
 * Connects via Supabase service client first, then falls back to direct pg client
 * to inspect information_schema.columns for required columns.
 * 
 * Required columns:
 * - raw_props.inserted_at
 * - raw_props.processed_at  
 * - unified_picks.promoted_at
 * - unified_picks.raw_id
 * 
 * Produces: out/db/column-check.json
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

import { getPromoterPool } from '@unit-talk/db';
import { logger } from '@unit-talk/observability';

import { getPgPoolDirect } from '../shared/db';

interface ColumnCheckResult {
  ok: boolean;
  missing: string[];
  found: string[];
  timestamp: string;
  method: 'supabase' | 'direct-pg' | 'failed';
  error?: string;
  details?: Record<string, any>;
}

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

/**
 * Required columns to check for
 */
const REQUIRED_COLUMNS = [
  'raw_props.inserted_at',
  'raw_props.processed_at',
  'unified_picks.promoted_at',
  'unified_picks.raw_id'
];

/**
 * Query via Supabase exec_sql RPC function (same pattern as verify-shape.ts)
 */
async function queryViaSupabase(sql: string): Promise<any[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or service key');
  }
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      apikey: serviceKey,
    } as any,
    body: JSON.stringify({ sql }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`exec_sql HTTP ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Attempt to check columns via Supabase exec_sql RPC
 */
async function checkColumnsViaSupabase(): Promise<ColumnInfo[]> {
  logger.debug('Attempting column check via Supabase exec_sql RPC');
  
  const sql = `
    SELECT 
      table_name,
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns 
    WHERE table_name IN ('raw_props', 'unified_picks')
      AND column_name IN ('inserted_at', 'processed_at', 'promoted_at', 'raw_id')
    ORDER BY table_name, column_name;
  `;
  
  const rows = await queryViaSupabase(sql);
  
  if (rows.length === 0) {
    logger.debug('No column data returned from Supabase exec_sql');
    throw new Error('No column data returned');
  }
  
  logger.debug('Successfully retrieved columns via Supabase exec_sql', { count: rows.length });
  return rows as ColumnInfo[];
}

/**
 * Fallback: check columns via direct PostgreSQL connection
 */
async function checkColumnsViaDirect(): Promise<ColumnInfo[]> {
  logger.debug('Attempting column check via direct PostgreSQL connection');
  
  const pool = getPgPoolDirect();
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name IN ('raw_props', 'unified_picks')
        AND column_name IN ('inserted_at', 'processed_at', 'promoted_at', 'raw_id')
      ORDER BY table_name, column_name;
    `;
    
    const result = await client.query(query);
    
    if (result.rows.length === 0) {
      throw new Error('No columns found in information_schema');
    }
    
    logger.debug('Successfully retrieved columns via direct PostgreSQL', { count: result.rows.length });
    return result.rows as ColumnInfo[];
    
  } finally {
    client.release();
  }
}

/**
 * Parse column info into our required format
 */
function parseColumnInfo(columns: ColumnInfo[]): { found: string[], missing: string[] } {
  const found = columns.map(col => `${col.table_name}.${col.column_name}`);
  const missing = REQUIRED_COLUMNS.filter(required => !found.includes(required));
  
  return { found, missing };
}

/**
 * Ensure output directory exists
 */
async function ensureOutputDir(): Promise<void> {
  const outDir = join(process.cwd(), 'out', 'db');
  try {
    await mkdir(outDir, { recursive: true });
  } catch (error) {
    logger.error('Failed to create output directory', { outDir, error });
    throw error;
  }
}

/**
 * Write result to JSON file
 */
async function writeResult(result: ColumnCheckResult): Promise<void> {
  const outputPath = join(process.cwd(), 'out', 'db', 'column-check.json');
  
  try {
    await writeFile(outputPath, JSON.stringify(result, null, 2));
    logger.info('Column check result written', { outputPath, ok: result.ok });
  } catch (error) {
    logger.error('Failed to write column check result', { outputPath, error });
    throw error;
  }
}

/**
 * Main column check function with robust error handling and fallback
 */
async function checkColumns(): Promise<ColumnCheckResult> {
  const timestamp = new Date().toISOString();
  
  // Strategy 1: Try Supabase client first
  try {
    const columns = await checkColumnsViaSupabase();
    const { found, missing } = parseColumnInfo(columns);
    
    return {
      ok: missing.length === 0,
      missing,
      found,
      timestamp,
      method: 'supabase',
      details: {
        total_columns_found: columns.length,
        strategy: 'supabase-client'
      }
    };
  } catch (supabaseError) {
    logger.warn('Supabase column check failed, trying direct PostgreSQL', { 
      error: supabaseError instanceof Error ? supabaseError.message : String(supabaseError) 
    });
    
    // Strategy 2: Fallback to direct PostgreSQL
    try {
      const columns = await checkColumnsViaDirect();
      const { found, missing } = parseColumnInfo(columns);
      
      return {
        ok: missing.length === 0,
        missing,
        found,
        timestamp,
        method: 'direct-pg',
        details: {
          total_columns_found: columns.length,
          strategy: 'direct-postgresql',
          supabase_fallback_reason: supabaseError instanceof Error ? supabaseError.message : String(supabaseError)
        }
      };
    } catch (directError) {
      logger.error('Both column check strategies failed', { 
        supabaseError: supabaseError instanceof Error ? supabaseError.message : String(supabaseError),
        directError: directError instanceof Error ? directError.message : String(directError)
      });
      
      // Complete failure
      return {
        ok: false,
        missing: REQUIRED_COLUMNS, // Assume all missing if we can't check
        found: [],
        timestamp,
        method: 'failed',
        error: `All strategies failed. Supabase: ${supabaseError instanceof Error ? supabaseError.message : String(supabaseError)}. Direct: ${directError instanceof Error ? directError.message : String(directError)}`,
        details: {
          strategies_attempted: ['supabase-client', 'direct-postgresql'],
          all_failed: true
        }
      };
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting column check probe');
    
    // Ensure output directory exists
    await ensureOutputDir();
    
    // Perform column check with fallback strategies
    const result = await checkColumns();
    
    // Write result to file
    await writeResult(result);
    
    // Log summary
    if (result.ok) {
      logger.info('✅ All required columns found', { 
        method: result.method, 
        found: result.found.length 
      });
    } else {
      logger.warn('❌ Missing required columns', { 
        method: result.method, 
        missing: result.missing,
        found: result.found.length
      });
    }
    
    // Exit with appropriate code
    process.exit(result.ok ? 0 : 1);
    
  } catch (error) {
    logger.error('Column check probe failed completely', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    
    // Write error result
    try {
      await ensureOutputDir();
      const errorResult: ColumnCheckResult = {
        ok: false,
        missing: REQUIRED_COLUMNS,
        found: [],
        timestamp: new Date().toISOString(),
        method: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
      await writeResult(errorResult);
    } catch (writeError) {
      logger.error('Failed to write error result', { writeError });
    }
    
    process.exit(1);
  } finally {
    // Clean up PostgreSQL pools
    try {
      const promoterPool = getPromoterPool();
      await promoterPool.end();
    } catch (poolError) {
      logger.debug('Promoter pool cleanup error (non-fatal)', { poolError });
    }
    
    try {
      const directPool = getPgPoolDirect();
      await directPool.end();
    } catch (poolError) {
      logger.debug('Direct pool cleanup error (non-fatal)', { poolError });
    }
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error in column check:', error);
    process.exit(1);
  });
}

export { checkColumns, ColumnCheckResult };