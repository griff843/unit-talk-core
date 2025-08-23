/**
 * Temporal activities for feed operations
 * Handles ingestion and processing activities (no unified_picks writes)
 */

import type {
  FeedAdapterConfig,
  FeedOperationResult,
} from '../adapters/feedAdapter.js';
import {
  executeFeedWorkflow,
  testFeedAdapter,
  getRawPropsStatistics,
} from '../adapters/feedAdapter.js';
import { logger } from '@unit-talk/observability';

/**
 * Execute feed ingestion and processing activity
 * Main activity for the feed workflow
 */
export async function executeFeedActivity(
  config: FeedAdapterConfig
): Promise<FeedOperationResult> {
  logger.info('Starting feed activity', { config });

  try {
    const result = await executeFeedWorkflow(config);

    logger.info('Feed activity completed', {
      success: result.success,
      ingested: result.ingested,
      processed: result.processed,
      rejected: result.rejected,
    });

    return result;
  } catch (error) {
    logger.error('Feed activity failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get feed statistics activity
 * Monitoring activity for pipeline health
 */
export async function getFeedStatisticsActivity(windowMinutes = 5): Promise<{
  raw_new: number;
  processed: number;
  unprocessed: number;
  window_start: string;
  window_end: string;
}> {
  try {
    logger.debug('Getting feed statistics', { windowMinutes });

    const stats = await getRawPropsStatistics(windowMinutes);

    logger.debug('Feed statistics retrieved', stats);

    return stats;
  } catch (error) {
    logger.error('Failed to get feed statistics', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Health check activity for feed system
 */
export async function feedHealthCheckActivity(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    logger.debug('Starting feed health check');

    // Test 1: Adapter connection
    const connectionTest = await testFeedAdapter();

    // Test 2: Recent statistics
    const recentStats = await getRawPropsStatistics(60); // 1 hour

    const healthy = connectionTest;

    const result = {
      healthy,
      timestamp: new Date().toISOString(),
      details: {
        connection: connectionTest,
        recent_stats: recentStats,
        adapter: 'operational',
      },
    };

    logger.info('Feed health check completed', {
      healthy: result.healthy,
      details: result.details,
    });

    return result;
  } catch (error) {
    logger.error('Feed health check failed', {
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
