/**
 * Temporal activities for analytics operations
 * Handles analytics processing, reporting, and metrics collection
 */

import type { AnalyticsAdapterConfig } from '../adapters/analyticsAdapter.js';
import {
  executeAnalyticsWorkflow,
  generateAnalyticsReports,
  collectAnalyticsMetrics,
  testAnalyticsAdapter,
  AnalyticsOperationResult,
} from '../adapters/analyticsAdapter.js';
import { logger } from '@unit-talk/observability';

/**
 * Execute analytics processing activity
 */
export async function executeAnalyticsActivity(
  config: AnalyticsAdapterConfig
): Promise<{ completed: number }> {
  logger.info('Starting analytics activity', { config });

  try {
    const result = await executeAnalyticsWorkflow(config);

    logger.info('Analytics activity completed', {
      success: result.success,
      completed: result.completed,
    });

    return { completed: result.completed };
  } catch (error) {
    logger.error('Analytics activity failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Generate analytics reports activity
 */
export async function generateReportsActivity(config: {
  analysisType: string;
  timeRange: { start: string; end: string };
  shadowMode: boolean;
}): Promise<{ generated: number }> {
  try {
    logger.info('Generating analytics reports', { config });

    const result = await generateAnalyticsReports(config);

    logger.info('Analytics reports generated', {
      generated: result.generated,
    });

    return result;
  } catch (error) {
    logger.error('Failed to generate analytics reports', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Collect analytics metrics activity
 */
export async function collectMetricsActivity(config: {
  timeRange: { start: string; end: string };
  shadowMode: boolean;
}): Promise<{ collected: number }> {
  try {
    logger.debug('Collecting analytics metrics', { config });

    const result = await collectAnalyticsMetrics(config);

    logger.debug('Analytics metrics collected', {
      collected: result.collected,
    });

    return result;
  } catch (error) {
    logger.error('Failed to collect analytics metrics', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Health check activity for analytics system
 */
export async function healthCheckActivity(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    logger.debug('Starting analytics health check');

    // Test adapter connection
    const connectionTest = await testAnalyticsAdapter();

    const healthy = connectionTest;

    const result = {
      healthy,
      timestamp: new Date().toISOString(),
      details: {
        connection: connectionTest,
        adapter: 'operational',
      },
    };

    logger.info('Analytics health check completed', {
      healthy: result.healthy,
      details: result.details,
    });

    return result;
  } catch (error) {
    logger.error('Analytics health check failed', {
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
