/**
 * Temporal workflow for promoter operations
 * Orchestrates the promotion of raw propositions to unified picks
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/promoterActivities.js';

// Configure activity timeouts and retry policies
const { executePromotionActivity, healthCheckActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes', // Max time for promotion operation
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

/**
 * Promoter workflow configuration
 */
export interface PromoterWorkflowParams {
  maxPromotionsPerWindow?: number;
  windowSizeMinutes?: number;
  minQualityThreshold?: number;
  maxAgeHours?: number;
  dryRun?: boolean;
}

/**
 * Promoter workflow result
 */
export interface PromoterWorkflowResult {
  success: boolean;
  promoted: number;
  rejected: number;
  floodGuardTriggered: boolean;
  error?: string;
  promotedIds?: string[];
  metadata: {
    totalCandidates: number;
    windowStart: string;
    windowEnd: string;
    duration: number;
  };
}

/**
 * Main promoter workflow
 * Executes promotion logic with proper error handling and observability
 */
export async function promoterWorkflow(
  params: PromoterWorkflowParams = {}
): Promise<PromoterWorkflowResult> {
  const startTime = Date.now();
  
  try {
    // Execute promotion activity
    const result = await executePromotionActivity(params);
    
    const duration = Date.now() - startTime;
    
    return {
      ...result,
      metadata: {
        ...result.metadata,
        duration,
      },
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      promoted: 0,
      rejected: 0,
      floodGuardTriggered: false,
      error: errorMessage,
      metadata: {
        totalCandidates: 0,
        windowStart: new Date().toISOString(),
        windowEnd: new Date().toISOString(),
        duration,
      },
    };
  }
}

/**
 * Health check workflow for promoter system
 */
export async function promoterHealthCheckWorkflow(): Promise<{
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