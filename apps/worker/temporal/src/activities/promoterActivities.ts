/**
 * Temporal activities for promoter operations
 * These activities handle the actual I/O operations
 */

import { checkPromoterHealth } from '@unit-talk/db';
import { logger } from '@unit-talk/observability';

import type {
  PromoterConfig,
  PromoterOperationResult,
} from '../adapters/promoterAdapter.js';
import {
  executePromoterWorkflow,
  testPromoterConnection,
} from '../adapters/promoterAdapter.js';

/**
 * Execute promotion activity
 * Main activity that orchestrates the promotion workflow
 */
export async function executePromotionActivity(
  config: PromoterConfig
): Promise<PromoterOperationResult> {
  logger.info('Starting promotion activity', { config });

  try {
    const result = await executePromoterWorkflow(config);

    logger.info('Promotion activity completed', {
      success: result.success,
      promoted: result.promoted,
      rejected: result.rejected,
      floodGuardTriggered: result.floodGuardTriggered,
      shadowModeBlocked: result.shadowModeBlocked,
    });

    return result;
  } catch (error) {
    logger.error('Promotion activity failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Health check activity for promoter system
 */
export async function healthCheckActivity(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    logger.debug('Starting promoter health check');

    // Test 1: Database connection with promoter role
    const dbHealth = await checkPromoterHealth();

    // Test 2: Adapter connection test
    const connectionTest = await testPromoterConnection();

    const healthy = dbHealth.healthy && connectionTest;

    const result = {
      healthy,
      timestamp: new Date().toISOString(),
      details: {
        database: dbHealth,
        connection: connectionTest,
        adapter: 'operational',
      },
    };

    logger.info('Promoter health check completed', {
      healthy: result.healthy,
      details: result.details,
    });

    return result;
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
