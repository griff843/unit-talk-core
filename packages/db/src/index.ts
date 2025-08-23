import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/**
 * Create Supabase admin client (service key)
 */
export function createAdminClient(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const config = getConfig();
  
  adminClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  logger.debug('Supabase admin client created');
  return adminClient;
}

/**
 * Create Supabase anon client (anon key)
 */
export function createAnonClient(): SupabaseClient {
  if (anonClient) {
    return anonClient;
  }

  const config = getConfig();
  
  anonClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  logger.debug('Supabase anon client created');
  return anonClient;
}

/**
 * Helper to set app.role=promoter for database operations
 * This enables bypassing RLS for promoter operations
 */
export async function setPromoterRole(client: SupabaseClient): Promise<void> {
  try {
    const { error } = await client.rpc('set_config', {
      setting_name: 'app.role',
      setting_value: 'promoter',
      is_local: true,
    });

    if (error) {
      logger.error('Failed to set promoter role', { error });
      throw new Error(`Failed to set promoter role: ${error.message}`);
    }

    logger.debug('Promoter role set successfully');
  } catch (error) {
    logger.error('Error setting promoter role', { 
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Execute a function with promoter role set
 */
export async function withPromoterRole<T>(
  client: SupabaseClient,
  fn: (client: SupabaseClient) => Promise<T>
): Promise<T> {
  await setPromoterRole(client);
  return await fn(client);
}

/**
 * Database connection health check
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  timestamp: string;
  details?: any;
}> {
  try {
    const client = createAnonClient();
    const { data, error } = await client.from('_health_check').select('1').limit(1);
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = table not found, which is ok
      throw error;
    }

    return {
      healthy: true,
      timestamp: new Date().toISOString(),
      details: { connectionTest: 'passed' },
    };
  } catch (error) {
    logger.error('Database health check failed', { 
      error: error instanceof Error ? error.message : String(error)
    });
    
    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      details: { 
        error: error instanceof Error ? error.message : String(error)
      },
    };
  }
}

// Re-export Supabase types for convenience
export type { SupabaseClient } from '@supabase/supabase-js';

// Promoter-specific PostgreSQL writer (single writer pattern)
export * from './promoter.js';