import { getConfig } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';
import type { PoolClient } from 'pg';
import { Pool } from 'pg';

/**
 * Promoter-specific database writer using direct PostgreSQL connection
 * Sets app.role='promoter' session variable to bypass RLS
 * ONLY for unified_picks table writes - single writer pattern
 */

let promoterPool: Pool | null = null;

/**
 * Get PostgreSQL pool with promoter role configuration
 * This is the ONLY writer allowed to insert into unified_picks
 */
export function getPromoterPool(): Pool {
  if (promoterPool) {
    return promoterPool;
  }

  const config = getConfig();

  promoterPool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 5, // Small pool size - single writer pattern
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl:
      config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  // Handle pool errors
  promoterPool.on('error', err => {
    logger.error('Promoter PostgreSQL pool error', { error: err.message });
  });

  logger.info('Promoter PostgreSQL pool created');
  return promoterPool;
}

/**
 * Get a client connection with promoter role set
 * CRITICAL: This sets app.role='promoter' to enable unified_picks writes
 */
export async function getPromoterClient(): Promise<PoolClient> {
  const pool = getPromoterPool();
  const client = await pool.connect();

  try {
    // CRITICAL: Set app.role='promoter' to bypass RLS and trigger validation
    await client.query("SELECT set_config('app.role', 'promoter', true)");
    logger.debug('Promoter role set on client connection');

    return client;
  } catch (error) {
    // Release client on error
    client.release();
    logger.error('Failed to set promoter role', { error });
    throw new Error(
      `Failed to set promoter role: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Execute function with promoter client (auto-release)
 * Template for safe promoter operations
 */
export async function withPromoterClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPromoterClient();

  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Insert a unified pick (SINGLE WRITER PATTERN)
 * This is the ONLY function authorized to write to unified_picks
 */
export interface UnifiedPickInsert {
  raw_id: string;
  data: Record<string, unknown>;
  promoted_at?: Date;
}

export async function insertUnifiedPick(
  client: PoolClient,
  pick: UnifiedPickInsert
): Promise<{ id: string; promoted_at: string }> {
  try {
    const promoted_at = pick.promoted_at || new Date();

    const result = await client.query(
      `INSERT INTO unified_picks (raw_id, promoted_at, data) 
       VALUES ($1, $2, $3) 
       RETURNING id, promoted_at`,
      [pick.raw_id, promoted_at.toISOString(), JSON.stringify(pick.data)]
    );

    if (result.rows.length === 0) {
      throw new Error('Insert returned no rows - possible RLS violation');
    }

    const inserted = result.rows[0];
    logger.info('Unified pick inserted successfully', {
      id: inserted.id,
      raw_id: pick.raw_id,
      promoted_at: inserted.promoted_at,
    });

    return {
      id: inserted.id,
      promoted_at: inserted.promoted_at,
    };
  } catch (error: any) {
    // Surface specific PostgreSQL errors clearly
    if (error.code === '42501') {
      throw new Error(
        'Access denied: app.role must be set to promoter (RLS violation)'
      );
    }
    if (error.code === '23503') {
      throw new Error(
        `Foreign key violation: raw_id ${pick.raw_id} does not exist`
      );
    }
    if (error.code === '23505') {
      throw new Error(
        `Duplicate key violation: pick for raw_id ${pick.raw_id} already exists`
      );
    }

    logger.error('Failed to insert unified pick', {
      error: error.message,
      code: error.code,
      raw_id: pick.raw_id,
    });
    throw error;
  }
}

/**
 * Batch insert unified picks (transactional)
 * Maintains single writer pattern with batching for efficiency
 */
export async function insertUnifiedPicksBatch(
  client: PoolClient,
  picks: UnifiedPickInsert[]
): Promise<Array<{ id: string; raw_id: string; promoted_at: string }>> {
  if (picks.length === 0) {
    return [];
  }

  try {
    await client.query('BEGIN');

    const results: Array<{ id: string; raw_id: string; promoted_at: string }> =
      [];

    for (const pick of picks) {
      const result = await insertUnifiedPick(client, pick);
      results.push({
        id: result.id,
        raw_id: pick.raw_id,
        promoted_at: result.promoted_at,
      });
    }

    await client.query('COMMIT');

    logger.info('Batch unified picks inserted successfully', {
      count: results.length,
    });
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Batch unified picks insert failed', {
      error: error instanceof Error ? error.message : String(error),
      count: picks.length,
    });
    throw error;
  }
}

/**
 * Count current promotions in time window (for flood guard)
 * Read-only helper for promotion logic
 */
export async function countPromotionsInWindow(
  client: PoolClient,
  windowStartTime: Date
): Promise<number> {
  try {
    const result = await client.query(
      'SELECT COUNT(*) as count FROM unified_picks WHERE promoted_at >= $1',
      [windowStartTime.toISOString()]
    );

    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('Failed to count promotions in window', {
      error: error instanceof Error ? error.message : String(error),
      windowStart: windowStartTime.toISOString(),
    });
    throw error;
  }
}

/**
 * Get existing promotions by raw_id (deduplication check)
 * Read-only helper for idempotency
 */
export async function getExistingPromotions(
  client: PoolClient,
  rawIds: string[]
): Promise<Array<{ raw_id: string; promoted_at: string }>> {
  if (rawIds.length === 0) {
    return [];
  }

  try {
    const placeholders = rawIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await client.query(
      `SELECT raw_id, promoted_at FROM unified_picks WHERE raw_id IN (${placeholders})`,
      rawIds
    );

    return result.rows;
  } catch (error) {
    logger.error('Failed to get existing promotions', {
      error: error instanceof Error ? error.message : String(error),
      rawIds: rawIds.length,
    });
    throw error;
  }
}

/**
 * Health check for promoter database connection
 * Verifies promoter role can be set and basic operations work
 */
export async function checkPromoterHealth(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    const result = await withPromoterClient(async client => {
      // Test 1: Verify role is set
      const roleResult = await client.query(
        "SELECT current_setting('app.role', true) as role"
      );
      const currentRole = roleResult.rows[0]?.role;

      if (currentRole !== 'promoter') {
        throw new Error(`Expected role 'promoter', got '${currentRole}'`);
      }

      // Test 2: Test basic query
      await client.query('SELECT 1');

      return {
        role: currentRole,
        connectionTest: 'passed',
      };
    });

    return {
      healthy: true,
      timestamp: new Date().toISOString(),
      details: result,
    };
  } catch (error) {
    logger.error('Promoter health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Clean shutdown of promoter pool
 * Call during application shutdown
 */
export async function closePromoterPool(): Promise<void> {
  if (promoterPool) {
    await promoterPool.end();
    promoterPool = null;
    logger.info('Promoter PostgreSQL pool closed');
  }
}
