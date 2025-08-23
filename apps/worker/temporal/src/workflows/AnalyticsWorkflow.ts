/**
 * Temporal workflow for analytics operations
 * Orchestrates data analysis and reporting with shadow mode support
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/AnalyticsActivities.js';

// Configure activity timeouts and retry policies
const {
  executeAnalyticsActivity,
  generateReportsActivity,
  collectMetricsActivity,
  healthCheckActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes', // Max time for analytics operations
  retry: {
    initialInterval: '2s',
    maximumInterval: '60s',
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

/**
 * Analytics workflow configuration
 */
export interface AnalyticsWorkflowParams {
  analysisType?: 'performance' | 'user' | 'financial' | 'predictive';
  timeRange?: {
    start: string;
    end: string;
  };
  includeReports?: boolean;
  shadowMode?: boolean;
  dryRun?: boolean;
}

/**
 * Analytics workflow result
 */
export interface AnalyticsWorkflowResult {
  success: boolean;
  analysisCompleted: number;
  reportsGenerated: number;
  metricsCollected: number;
  error?: string;
  metadata: {
    timeRange: {
      start: string;
      end: string;
    };
    analysisType: string;
    processingDuration: number;
    shadowMode: boolean;
  };
}

/**
 * Main analytics workflow
 * Executes analytics processing with proper error handling
 */
export async function analyticsWorkflow(
  params: AnalyticsWorkflowParams = {}
): Promise<AnalyticsWorkflowResult> {
  const startTime = Date.now();
  const timeRange = params.timeRange || {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
  };

  try {
    // Execute analytics processing
    const analyticsResult = await executeAnalyticsActivity({
      analysisType: params.analysisType || 'performance',
      timeRange,
      shadowMode: params.shadowMode || false,
      dryRun: params.dryRun || false,
    });

    let reportsResult = { generated: 0 };
    if (params.includeReports && !params.dryRun) {
      reportsResult = await generateReportsActivity({
        analysisType: params.analysisType || 'performance',
        timeRange,
        shadowMode: params.shadowMode || false,
      });
    }

    // Collect metrics (safe in shadow mode)
    const metricsResult = await collectMetricsActivity({
      timeRange,
      shadowMode: params.shadowMode || false,
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      analysisCompleted: analyticsResult.completed,
      reportsGenerated: reportsResult.generated,
      metricsCollected: metricsResult.collected,
      metadata: {
        timeRange,
        analysisType: params.analysisType || 'performance',
        processingDuration: duration,
        shadowMode: params.shadowMode || false,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      analysisCompleted: 0,
      reportsGenerated: 0,
      metricsCollected: 0,
      error: errorMessage,
      metadata: {
        timeRange,
        analysisType: params.analysisType || 'performance',
        processingDuration: duration,
        shadowMode: params.shadowMode || false,
      },
    };
  }
}

/**
 * Health check workflow for analytics system
 */
export async function analyticsHealthCheckWorkflow(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    return await healthCheckActivity();
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
