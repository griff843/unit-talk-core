#!/usr/bin/env tsx
import './bootstrapEnv';

import { Pool, PoolClient } from 'pg';
import { createClient } from '@supabase/supabase-js';

/**
 * @fileoverview Shared DB Helpers for Unit Talk Core
 * @version 2.0.0
 * @author Unit Talk E2E Validation Team
 *
 * Provides centralized database access with RLS session management:
 * - Primary: Direct PostgreSQL via pg.Pool using DATABASE_URL with session vars
 * - Fallback: Supabase service role client with service key
 * - Supabase anon client for read-only operations
 *
 * Features:
 * - withSession wrapper for RLS-aware operations
 * - Single source of truth for DB connections
 * - Automatic session variable configuration
 * - Support for APP_ROLE_FOR_TASK and APP_TENANT_ID
 *
 * All helpers throw informative errors with client type annotation.
 * Used by: shadow-run.ts, parity-check.ts, canary scripts, migration scripts
 */

let pgPool: Pool | null = null;
let supabaseService: ReturnType<typeof createClient> | null = null;
let supabaseAnon: ReturnType<typeof createClient> | null = null;

/**
 * Get PostgreSQL Pool connection using DATABASE_URL
 * Preferred for direct DB operations with full access
 * @returns Singleton pg.Pool instance
 */
export function getPgPool(): Pool {
  if (!pgPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL environment variable is required for pg.Pool connection'
      );
    }

    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    pgPool.on('error', (err: unknown) => {
      console.error('Unexpected error on idle pg client', err);
    });
  }

  return pgPool;
}

/**
 * Execute a function with proper RLS session configuration
 * Sets app.role and app.tenant_id for Row Level Security
 * @param fn Function to execute with configured client
 * @returns Result of the function
 */
export async function withSession<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  
  try {
    // Set session variables for RLS
    const appRole = process.env.APP_ROLE_FOR_TASK || 'promoter';
    const tenantId = process.env.APP_TENANT_ID || 'public';
    
    // Use set_config to set session variables
    await client.query('SELECT set_config($1, $2, $3)', ['app.role', appRole, true]);
    await client.query('SELECT set_config($1, $2, $3)', ['app.tenant_id', tenantId, true]);
    
    // Execute the function with configured client
    return await fn(client);
  } finally {
    client.release();
  }
}

// Keep legacy name for backward compatibility
export const getPg = getPgPool;

/**
 * Get Supabase service role client with full database access (admin)
 * Used as fallback when pg.Pool fails or for Supabase-specific operations
 * @returns Supabase client with service role permissions
 */
export function getSupabaseAdmin() {
  if (!supabaseService) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY are required for service client'
      );
    }

    supabaseService = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public'
      }
    });
  }

  return supabaseService;
}

/**
 * Get Supabase anon client for read-only operations
 * Uses anon key with limited permissions
 * @returns Supabase client with anon permissions
 */
export function getSupabaseAnon() {
  if (!supabaseAnon) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_ANON_KEY are required for anon client'
      );
    }

    supabaseAnon = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public'
      }
    });
  }

  return supabaseAnon;
}

// Keep legacy name for backward compatibility
export const getSupaService = getSupabaseAdmin;

/**
 * Count raw_props within a time window (in minutes)
 * Tries pg.Pool first, falls back to Supabase service client
 */
export async function countRawProps(
  windowMinutes: number = 5
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  try {
    // Try pg.Pool first with session (preferred)
    return await withSession(async (client) => {
      const query = `
        SELECT COUNT(*) as count 
        FROM public.raw_props 
        WHERE inserted_at >= $1
      `;
      const result = await client.query(query, [windowStart.toISOString()]);
      return parseInt(result.rows[0].count, 10);
    });
  } catch (pgError) {
    try {
      // Fallback to Supabase admin client
      const supabase = getSupabaseAdmin();
      const { count, error } = await supabase
        .from('raw_props')
        .select('*', { count: 'exact', head: true })
        .gte('inserted_at', windowStart.toISOString());

      if (error) {
        throw new Error(
          `supabase: ${error.message || error.code || JSON.stringify(error)}`
        );
      }

      return count || 0;
    } catch (supabaseError) {
      const pgErrorMsg =
        pgError instanceof Error ? pgError.message : String(pgError);
      const supabaseErrorMsg =
        supabaseError instanceof Error
          ? supabaseError.message
          : String(supabaseError);
      throw new Error(
        `Failed to count raw_props (window: ${windowMinutes}min). pg: ${pgErrorMsg}. supabase: ${supabaseErrorMsg}`
      );
    }
  }
}

/**
 * Count processed raw_props within a time window (in minutes)
 * Tries pg.Pool first, falls back to Supabase service client
 */
export async function countProcessed(
  windowMinutes: number = 5
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  try {
    // Try pg.Pool first with session (preferred)
    return await withSession(async (client) => {
      const query = `
        SELECT COUNT(*) as count 
        FROM public.raw_props 
        WHERE inserted_at >= $1 
          AND processed_at IS NOT NULL
      `;
      const result = await client.query(query, [windowStart.toISOString()]);
      return parseInt(result.rows[0].count, 10);
    });
  } catch (pgError) {
    try {
      // Fallback to Supabase admin client
      const supabase = getSupabaseAdmin();
      const { count, error } = await supabase
        .from('raw_props')
        .select('*', { count: 'exact', head: true })
        .gte('inserted_at', windowStart.toISOString())
        .not('processed_at', 'is', null);

      if (error) {
        throw new Error(
          `supabase: ${error.message || error.code || JSON.stringify(error)}`
        );
      }

      return count || 0;
    } catch (supabaseError) {
      const pgErrorMsg =
        pgError instanceof Error ? pgError.message : String(pgError);
      const supabaseErrorMsg =
        supabaseError instanceof Error
          ? supabaseError.message
          : String(supabaseError);
      throw new Error(
        `Failed to count processed (window: ${windowMinutes}min). pg: ${pgErrorMsg}. supabase: ${supabaseErrorMsg}`
      );
    }
  }
}

/**
 * Count promoted unified_picks within a time window (in minutes)
 * Tries pg.Pool first, falls back to Supabase service client
 */
export async function countPromoted(
  windowMinutes: number = 5
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  try {
    // Try pg.Pool first with session (preferred)
    return await withSession(async (client) => {
      const query = `
        SELECT COUNT(*) as count 
        FROM public.unified_picks 
        WHERE promoted_at >= $1
      `;
      const result = await client.query(query, [windowStart.toISOString()]);
      return parseInt(result.rows[0].count, 10);
    });
  } catch (pgError) {
    try {
      // Fallback to Supabase admin client
      const supabase = getSupabaseAdmin();
      const { count, error } = await supabase
        .from('unified_picks')
        .select('*', { count: 'exact', head: true })
        .gte('promoted_at', windowStart.toISOString());

      if (error) {
        throw new Error(
          `supabase: ${error.message || error.code || JSON.stringify(error)}`
        );
      }

      return count || 0;
    } catch (supabaseError) {
      const pgErrorMsg =
        pgError instanceof Error ? pgError.message : String(pgError);
      const supabaseErrorMsg =
        supabaseError instanceof Error
          ? supabaseError.message
          : String(supabaseError);
      throw new Error(
        `Failed to count promoted (window: ${windowMinutes}min). pg: ${pgErrorMsg}. supabase: ${supabaseErrorMsg}`
      );
    }
  }
}

/**
 * Seed a canary row into raw_props table
 * Returns the canary ID for tracking
 */
export async function seedCanary(canaryId?: string): Promise<string> {
  const id =
    canaryId ||
    `shadow-canary-${new Date().toISOString().slice(0, 16).replace(/[:-]/g, '')}`;

  try {
    // Try pg.Pool first with session (preferred)
    return await withSession(async (client) => {
      const query = `
        INSERT INTO public.raw_props (id, data, type, source, is_canary)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET 
          data = EXCLUDED.data
        RETURNING id
      `;

      const payload = {
        type: 'shadow_canary',
        timestamp: new Date().toISOString(),
        source: 'e2e_validation',
        shadow_mode: true,
      };

      const result = await client.query(query, [
        id, 
        JSON.stringify(payload),
        'canary_test',
        'acceptance',
        true
      ]);
      return result.rows[0].id;
    });
  } catch (pgError) {
    try {
      // Fallback to Supabase admin client
      const supabase = getSupabaseAdmin();

      const payload = {
        type: 'shadow_canary',
        timestamp: new Date().toISOString(),
        source: 'e2e_validation',
        shadow_mode: true,
      };

      const { data, error } = await supabase
        .from('raw_props')
        .upsert([
          {
            id,
            data: payload,
            type: 'canary_test',
            source: 'acceptance',
            is_canary: true,
          },
        ])
        .select('id')
        .single();

      if (error) {
        throw new Error(
          `supabase: ${error.message || error.code || JSON.stringify(error)}`
        );
      }

      return data.id;
    } catch (supabaseError) {
      const pgErrorMsg =
        pgError instanceof Error ? pgError.message : String(pgError);
      const supabaseErrorMsg =
        supabaseError instanceof Error
          ? supabaseError.message
          : String(supabaseError);
      throw new Error(
        `Failed to seed canary (id: ${id}). pg: ${pgErrorMsg}. supabase: ${supabaseErrorMsg}`
      );
    }
  }
}

/**
 * Cleanup canary data from both raw_props and unified_picks
 * Used for test cleanup when CLEANUP_AFTER=true
 */
export async function cleanupCanary(
  canaryId: string
): Promise<{ rawDeleted: number; unifiedDeleted: number }> {
  try {
    // Try pg.Pool first with session (preferred)
    return await withSession(async (client) => {
      await client.query('BEGIN');
      try {
        // Delete from unified_picks first (foreign key constraint)
        const unifiedResult = await client.query(
          'DELETE FROM public.unified_picks WHERE raw_id = $1',
          [canaryId]
        );

        // Delete from raw_props
        const rawResult = await client.query(
          'DELETE FROM public.raw_props WHERE id = $1',
          [canaryId]
        );

        await client.query('COMMIT');

        return {
          rawDeleted: rawResult.rowCount || 0,
          unifiedDeleted: unifiedResult.rowCount || 0,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  } catch (pgError) {
    try {
      // Fallback to Supabase admin client
      const supabase = getSupabaseAdmin();

      // Delete from unified_picks first
      const { error: unifiedError, count: unifiedCount } = await supabase
        .from('unified_picks')
        .delete({ count: 'exact' })
        .eq('raw_id', canaryId);

      if (unifiedError) {
        throw new Error(
          `unified_picks cleanup failed: ${unifiedError.message}`
        );
      }

      // Delete from raw_props
      const { error: rawError, count: rawCount } = await supabase
        .from('raw_props')
        .delete({ count: 'exact' })
        .eq('id', canaryId);

      if (rawError) {
        throw new Error(`raw_props cleanup failed: ${rawError.message}`);
      }

      return {
        rawDeleted: rawCount || 0,
        unifiedDeleted: unifiedCount || 0,
      };
    } catch (supabaseError) {
      const pgErrorMsg =
        pgError instanceof Error ? pgError.message : String(pgError);
      const supabaseErrorMsg =
        supabaseError instanceof Error
          ? supabaseError.message
          : String(supabaseError);
      throw new Error(
        `Failed to cleanup canary (id: ${canaryId}). pg: ${pgErrorMsg}. supabase: ${supabaseErrorMsg}`
      );
    }
  }
}

/**
 * Execute a promotion using the real promoter workflow
 * This is the ONLY function allowed to write to unified_picks (single-writer rule)
 */
export async function executePromoterWrite(rawId: string): Promise<string> {
  try {
    // Try pg.Pool first with session (preferred)
    return await withSession(async (client) => {
      const query = `
        INSERT INTO public.unified_picks (raw_id, promoted_at, data)
        VALUES ($1, NOW(), $2)
        RETURNING id
      `;

      const payload = {
        source: 'promoter_workflow',
        promoted_by: 'shadow_e2e_promoter',
        timestamp: new Date().toISOString(),
        shadow_mode: true,
      };

      const result = await client.query(query, [rawId, JSON.stringify(payload)]);
      return result.rows[0].id;
    });
  } catch (pgError) {
    try {
      // Fallback to Supabase admin client
      const supabase = getSupabaseAdmin();

      const payload = {
        source: 'promoter_workflow',
        promoted_by: 'shadow_e2e_promoter',
        timestamp: new Date().toISOString(),
        shadow_mode: true,
      };

      const { data, error } = await supabase
        .from('unified_picks')
        .insert({
          raw_id: rawId,
          promoted_at: new Date().toISOString(),
          data: payload,
        })
        .select('id')
        .single();

      if (error) {
        throw new Error(
          `supabase: ${error.message || error.code || JSON.stringify(error)}`
        );
      }

      return data.id;
    } catch (supabaseError) {
      const pgErrorMsg =
        pgError instanceof Error ? pgError.message : String(pgError);
      const supabaseErrorMsg =
        supabaseError instanceof Error
          ? supabaseError.message
          : String(supabaseError);
      throw new Error(
        `Failed to execute promoter write (rawId: ${rawId}). pg: ${pgErrorMsg}. supabase: ${supabaseErrorMsg}`
      );
    }
  }
}

/**
 * Close all connections gracefully
 */
export async function closeConnections(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  // Supabase client doesn't need explicit cleanup
  supabaseService = null;
}
