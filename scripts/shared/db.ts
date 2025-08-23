// scripts/shared/db.ts
import { Pool, PoolClient } from 'pg';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

let directPool: Pool | null = null;
let appPool: Pool | null = null;

export function getPgPoolDirect(): Pool {
  // Uses DATABASE_URL_DIRECT (preferred) else DATABASE_URL
  const cs = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!cs) throw new Error('Missing DATABASE_URL (or DATABASE_URL_DIRECT)');
  if (!directPool) {
    directPool = new Pool({ 
      connectionString: cs, 
      ssl: { rejectUnauthorized: false },
      // Try to bypass RLS for migrations by using service role settings
      application_name: 'unit-talk-migrations'
    });
  }
  return directPool;
}

export function getPgPool(): Pool {
  // Same as above, but we keep a second handle for application context if needed
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('Missing DATABASE_URL');
  if (!appPool) appPool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  return appPool;
}

/** RLS-aware runner for app queries (NOT used by migrations). */
export async function withSession<T>(
  fn: (c: PoolClient) => Promise<T>,
  opts?: { role?: string; tenant?: string }
): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    const role = opts?.role ?? process.env.APP_ROLE_FOR_TASK ?? 'promoter';
    const tenant = opts?.tenant ?? process.env.APP_TENANT_ID ?? 'public';
    await client.query(`select set_config('app.role', $1, true)`, [role]);
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenant]);
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Count functions using withSession with robust error handling */
export async function countRawProps(windowMinutes: number = 5): Promise<number> {
  const sql = `
    select count(*) filter (where inserted_at >= now() - interval '${windowMinutes} minutes') as raw_new_5min
    from public.raw_props
  `;
  
  try {
    return await withSession(async (client) => {
      const result = await client.query(sql);
      return parseInt(result.rows[0].raw_new_5min, 10);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to count raw_props (window: ${windowMinutes}min). sql: ${sql.trim()}. error: ${errorMessage}`);
  }
}

export async function countProcessed(windowMinutes: number = 5): Promise<number> {
  try {
    // Try withSession first (RLS-aware)
    return await withSession(async (client) => {
      const sql = `
        select count(*) filter (where updated_at >= now() - interval '${windowMinutes} minutes') as processed_5min
        from public.raw_props where is_promoted = true
      `;
      const result = await client.query(sql);
      return parseInt(result.rows[0].processed_5min, 10);
    });
  } catch (pgError) {
    // Fallback to Supabase
    try {
      const supabase = getSupabaseAdmin();
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
      
      const { count, error } = await supabase
        .from('raw_props')
        .select('*', { count: 'exact', head: true })
        .eq('is_promoted', true)
        .gte('updated_at', windowStart.toISOString());
        
      if (error) {
        throw new Error(`Supabase processed count error: ${error.message}`);
      }
      
      return count || 0;
    } catch (supabaseError) {
      const errorMessage = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
      throw new Error(`Failed to count processed (both pg and supabase failed). window: ${windowMinutes}min. error: ${errorMessage}`);
    }
  }
}

export async function countPromoted(windowMinutes: number = 5): Promise<number> {
  try {
    // Try withSession first (RLS-aware)
    return await withSession(async (client) => {
      const sql = `
        select count(*) as promoted_5min
        from public.unified_picks
        where created_at >= now() - interval '${windowMinutes} minutes' 
        and status = 'active'
      `;
      const result = await client.query(sql);
      return parseInt(result.rows[0].promoted_5min, 10);
    });
  } catch (pgError) {
    // Fallback to Supabase
    try {
      const supabase = getSupabaseAdmin();
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
      
      const { count, error } = await supabase
        .from('unified_picks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('created_at', windowStart.toISOString());
        
      if (error) {
        throw new Error(`Supabase promoted count error: ${error.message}`);
      }
      
      return count || 0;
    } catch (supabaseError) {
      const errorMessage = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
      throw new Error(`Failed to count promoted (both pg and supabase failed). window: ${windowMinutes}min. error: ${errorMessage}`);
    }
  }
}

/** Execute promoter write (single-writer contract) */
export async function executePromoterWrite(rawId: string): Promise<string> {
  const sql = `
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

  return await withSession(async (client) => {
    const result = await client.query(sql, [rawId, JSON.stringify(payload)]);
    return result.rows[0].id;
  });
}

/** Get Supabase service client (for migrations fallback) */
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Robust count result interface for error handling and fallback strategies
 */
export interface RobustCountResult {
  count: number;
  error?: string;
  source: 'processed_at' | 'seed_sidecar' | 'raw_mirror' | 'pg' | 'supabase';
}

/** Robust processed count function with enhanced error handling and shadow mode fallbacks */
export async function countProcessedRobust(windowMinutes: number = 5): Promise<RobustCountResult> {
  const isInShadowMode = process.env.SHADOW_MODE === 'true';
  
  // PRIMARY strategy: Try processed_at column
  try {
    // Try withSession first (RLS-aware)
    const count = await withSession(async (client) => {
      const sql = `
        select count(*) as processed_count
        from public.raw_props
        where processed_at IS NOT NULL
        and processed_at >= now() - interval '${windowMinutes} minutes'
      `;
      const result = await client.query(sql);
      return parseInt(result.rows[0].processed_count, 10);
    });
    
    return {
      count,
      source: 'processed_at'
    };
  } catch (pgError) {
    // Fallback to Supabase for processed_at
    try {
      const supabase = getSupabaseAdmin();
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
      
      const { count, error } = await supabase
        .from('raw_props')
        .select('*', { count: 'exact', head: true })
        .not('processed_at', 'is', null)
        .gte('processed_at', windowStart.toISOString());
        
      if (error) {
        throw new Error(`Supabase processed count error: ${error.message}`);
      }
      
      return {
        count: count || 0,
        source: 'processed_at'
      };
    } catch (supabaseError) {
      // If not in shadow mode, throw error immediately
      if (!isInShadowMode) {
        const errorMessage = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
        throw new Error(`Failed to count processed (both pg and supabase failed). window: ${windowMinutes}min. error: ${errorMessage}`);
      }
      
      // SHADOW MODE FALLBACKS
      console.log(`⚠️  Primary processed_at strategy failed: ${supabaseError instanceof Error ? supabaseError.message : supabaseError}`);
      console.log('🔄 Trying shadow mode fallback strategies...');
      
      // Try seed sidecar fallback
      try {
        const lastSeedData = (global as any).__lastSeedBatch;
        if (lastSeedData && lastSeedData.processedCount !== undefined) {
          console.log(`✅ Using seed sidecar fallback: ${lastSeedData.processedCount}`);
          return {
            count: lastSeedData.processedCount,
            error: `Primary failed: ${supabaseError instanceof Error ? supabaseError.message : supabaseError}`,
            source: 'seed_sidecar'
          };
        }
      } catch (sidecarError) {
        console.log(`⚠️  Seed sidecar fallback failed: ${sidecarError}`);
      }
      
      // Final fallback: raw mirror (shadow mode only)
      try {
        console.log('🔄 Final fallback: using raw_new_5min as processed_5min (shadow only)');
        const rawResult = await countRawPropsRobust(windowMinutes);
        return {
          count: rawResult.count,
          error: `All strategies failed, using raw mirror: ${supabaseError instanceof Error ? supabaseError.message : supabaseError}`,
          source: 'raw_mirror'
        };
      } catch (rawError) {
        // Complete failure in shadow mode - return 0 with error
        const errorMessage = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
        return {
          count: 0,
          error: `Complete failure in shadow mode: ${errorMessage}`,
          source: 'raw_mirror'
        };
      }
    }
  }
}

/** Robust promoted count function with enhanced error handling */
export async function countPromotedRobust(windowMinutes: number = 5): Promise<RobustCountResult> {
  try {
    // Try withSession first (RLS-aware)
    return await withSession(async (client) => {
      const sql = `
        select count(*) as promoted_count
        from public.unified_picks
        where created_at >= now() - interval '${windowMinutes} minutes'
        and status = 'active'
      `;
      const result = await client.query(sql);
      const count = parseInt(result.rows[0].promoted_count, 10);
      return {
        count,
        source: 'pg'
      };
    });
  } catch (pgError) {
    // Fallback to Supabase
    try {
      const supabase = getSupabaseAdmin();
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
      
      const { count, error } = await supabase
        .from('unified_picks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('created_at', windowStart.toISOString());
        
      if (error) {
        throw new Error(`Supabase promoted count error: ${error.message}`);
      }
      
      return {
        count: count || 0,
        source: 'supabase'
      };
    } catch (supabaseError) {
      const errorMessage = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
      throw new Error(`Failed to count promoted (both pg and supabase failed). window: ${windowMinutes}min. error: ${errorMessage}`);
    }
  }
}

/** Robust count function with enhanced error handling */
export async function countRawPropsRobust(windowMinutes: number = 5): Promise<RobustCountResult> {
  try {
    // Try withSession first (RLS-aware)
    return await withSession(async (client) => {
      const sql = `
        select count(*) filter (where created_at >= now() - interval '${windowMinutes} minutes') as raw_new_5min
        from public.raw_props
      `;
      const result = await client.query(sql);
      const count = parseInt(result.rows[0].raw_new_5min, 10);
      return {
        count,
        source: 'pg'
      };
    });
  } catch (pgError) {
    console.log(`  ⚠️ withSession failed: ${pgError instanceof Error ? pgError.message : pgError}`);
    console.log('  🔄 Falling back to Supabase count...');
    
    // Fallback to Supabase
    try {
      const supabase = getSupabaseAdmin();
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
      
      const { count, error } = await supabase
        .from('raw_props')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', windowStart.toISOString());
        
      if (error) {
        throw new Error(`Supabase count error: ${error.message}`);
      }
      
      console.log(`  ✅ Supabase count successful: ${count} rows in ${windowMinutes}min window`);
      return {
        count: count || 0,
        source: 'supabase'
      };
    } catch (supabaseError) {
      const errorMessage = supabaseError instanceof Error ? supabaseError.message : String(supabaseError);
      throw new Error(`Failed to count raw_props (both pg and supabase failed). window: ${windowMinutes}min. supabase_error: ${errorMessage}. pg_error: ${pgError instanceof Error ? pgError.message : pgError}`);
    }
  }
}

/** Close all connections gracefully */
export async function closeConnections(): Promise<void> {
  if (directPool) {
    await directPool.end();
    directPool = null;
  }
  if (appPool) {
    await appPool.end();
    appPool = null;
  }
}