/**
 * Temporal workflow for feed operations
 * Orchestrates ingestion and processing (no unified_picks operations)
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/feedActivities.js';

// Configure activity timeouts and retry policies
const { executeFeedActivity, getFeedStatisticsActivity, feedHealthCheckActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '3 minutes', // Max time for feed operation
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

/**
 * Feed workflow configuration
 */
export interface FeedWorkflowParams {
  enableDeduplication?: boolean;
  minQualityScore?: number;
  batchSize?: number;
  maxItemsPerRun?: number;
  dryRun?: boolean;
}

/**
 * Feed workflow result
 */
export interface FeedWorkflowResult {
  success: boolean;
  ingested: number;
  processed: number;
  rejected: number;
  duplicatesRemoved: number;
  error?: string;
  insertedIds?: string[];
  metadata: {
    totalInput: number;
    averageQualityScore: number;
    processingDuration: number;
    batchesProcessed: number;
  };
}

/**
 * Main feed workflow
 * Executes ingestion and processing with proper error handling
 */
export async function feedWorkflow(
  params: FeedWorkflowParams = {}
): Promise<FeedWorkflowResult> {
  const startTime = Date.now();
  
  try {
    // Execute feed ingestion and processing activity
    const result = await executeFeedActivity({
      enableDeduplication: params.enableDeduplication,
      minQualityScore: params.minQualityScore,
      batchSize: params.batchSize,
      maxItemsPerRun: params.maxItemsPerRun,
      dryRun: params.dryRun,
    });
    
    const duration = Date.now() - startTime;
    
    return {
      ...result,
      metadata: {
        ...result.metadata,
        processingDuration: duration,
      },
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      ingested: 0,
      processed: 0,
      rejected: 0,
      duplicatesRemoved: 0,
      error: errorMessage,
      metadata: {
        totalInput: 0,
        averageQualityScore: 0,
        processingDuration: duration,
        batchesProcessed: 0,
      },
    };
  }
}

/**
 * Feed statistics workflow
 * Gets current pipeline statistics
 */
export async function feedStatisticsWorkflow(
  windowMinutes = 5
): Promise<{
  success: boolean;
  statistics?: {
    raw_new: number;
    processed: number;
    unprocessed: number;
    window_start: string;
    window_end: string;
  };
  error?: string;
}> {
  try {
    const stats = await getFeedStatisticsActivity(windowMinutes);
    
    return {
      success: true,
      statistics: stats,
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Health check workflow for feed system
 */
export async function feedHealthCheckWorkflow(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    return await feedHealthCheckActivity();
  } catch (error) {
    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}