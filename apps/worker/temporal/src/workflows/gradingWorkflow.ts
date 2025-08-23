/**
 * Grading Workflow - Temporal workflow for grading promoted picks
 * Shadow-safe by default, no writes to unified_picks
 */

import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities/gradingActivities.js';

// Proxy activities with timeout configuration
const { executeGradingWorkflow, gradeSinglePick, testGradingConnection } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10m', // 10 minutes for grading operations
    heartbeatTimeout: '30s',
    retryPolicy: {
      initialInterval: '5s',
      maximumInterval: '1m',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  });

/**
 * Workflow configuration for grading operations
 */
export interface GradingWorkflowConfig {
  shadowMode?: boolean;
  qualityThreshold?: number;
  enabledFactors?: string[];
  factorWeights?: Record<string, number>;
  batchSize?: number;
  maxAge?: number;
  runInterval?: string; // Cron-like interval
}

/**
 * Workflow result for grading operations
 */
export interface GradingWorkflowResult {
  success: boolean;
  graded: number;
  failed: number;
  avgScore: number;
  tierDistribution: Record<string, number>;
  processingTime: number;
  error?: string;
}

/**
 * Main grading workflow - grades recently promoted picks
 */
export async function gradingWorkflow(
  config: GradingWorkflowConfig = {}
): Promise<GradingWorkflowResult> {
  // Default configuration with shadow mode enabled by default
  const workflowConfig = {
    shadowMode: true, // Safe default - no writes
    qualityThreshold: 0.7,
    batchSize: 50,
    maxAge: 1440, // 24 hours
    ...config,
  };

  try {
    // Test connection health first
    const connectionOk = await testGradingConnection();
    if (!connectionOk) {
      throw new Error('Grading database connection test failed');
    }

    // Execute grading workflow through adapter
    const result = await executeGradingWorkflow(workflowConfig);

    return {
      success: result.success,
      graded: result.graded,
      failed: result.failed,
      avgScore: result.metadata.avgScore,
      tierDistribution: result.metadata.tierDistribution,
      processingTime: result.metadata.processingTime,
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      graded: 0,
      failed: 0,
      avgScore: 0,
      tierDistribution: {},
      processingTime: 0,
      error: errorMessage,
    };
  }
}

/**
 * Single pick grading workflow - for ad-hoc grading requests
 */
export async function singlePickGradingWorkflow(
  pickId: string,
  config: GradingWorkflowConfig = {}
): Promise<{
  success: boolean;
  pickId: string;
  gradingResult?: any;
  marketOutcome?: string;
  error?: string;
}> {
  const workflowConfig = {
    shadowMode: true, // Safe default
    qualityThreshold: 0.7,
    ...config,
  };

  try {
    const result = await gradeSinglePick(pickId, workflowConfig);

    if (!result) {
      return {
        success: false,
        pickId,
        error: 'Pick not found or could not be graded',
      };
    }

    return {
      success: true,
      pickId,
      gradingResult: {
        totalScore: result.gradingResult.totalScore,
        tier: result.gradingResult.tier,
        confidenceLevel: result.gradingResult.confidenceLevel,
        edgeScore: result.gradingResult.edgeScore,
        riskScore: result.gradingResult.riskScore,
      },
      marketOutcome: result.marketOutcome,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      pickId,
      error: errorMessage,
    };
  }
}

/**
 * Health check workflow for grading system
 */
export async function gradingHealthCheckWorkflow(): Promise<{
  success: boolean;
  connectionOk: boolean;
  error?: string;
}> {
  try {
    const connectionOk = await testGradingConnection();

    return {
      success: connectionOk,
      connectionOk,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      connectionOk: false,
      error: errorMessage,
    };
  }
}
