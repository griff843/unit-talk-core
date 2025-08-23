/**
 * Grading Activities - Temporal activities that call the grading adapter
 * These are the actual functions that execute the I/O operations
 */

import { Context } from '@temporalio/activity';
import {
  executeGradingWorkflow as executeGradingWorkflowAdapter,
  gradeSinglePick as gradeSinglePickAdapter,
  testGradingConnection as testGradingConnectionAdapter,
  GradingAdapterConfig,
  GradingOperationResult,
  GradingWithOutcome,
} from '../adapters/gradingAdapter.js';
import { logger } from '@unit-talk/observability';

/**
 * Activity: Execute grading workflow for batch of promoted picks
 * Shadow-safe by default
 */
export async function executeGradingWorkflow(
  config: GradingAdapterConfig = {}
): Promise<GradingOperationResult> {
  const context = Context.current();
  const activityId = context.info.activityId;
  
  logger.info('Starting grading workflow activity', { 
    activityId, 
    config 
  });

  try {
    // Ensure shadow mode is enabled by default for safety
    const safeConfig = {
      shadowMode: true, // Safe default - never write to unified_picks
      ...config,
    };

    // Send heartbeat before starting long operation
    context.heartbeat('Starting grading workflow');

    const result = await executeGradingWorkflowAdapter(safeConfig);

    // Send heartbeat with progress
    context.heartbeat(`Completed grading: ${result.graded} picks`);

    logger.info('Grading workflow activity completed', {
      activityId,
      graded: result.graded,
      failed: result.failed,
      avgScore: result.metadata.avgScore,
    });

    return result;

  } catch (error) {
    logger.error('Grading workflow activity failed', {
      activityId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Activity: Grade a single pick
 * Shadow-safe by default
 */
export async function gradeSinglePick(
  pickId: string,
  config: GradingAdapterConfig = {}
): Promise<GradingWithOutcome | null> {
  const context = Context.current();
  const activityId = context.info.activityId;
  
  logger.info('Starting single pick grading activity', { 
    activityId, 
    pickId,
    config 
  });

  try {
    // Ensure shadow mode is enabled by default for safety
    const safeConfig = {
      shadowMode: true,
      ...config,
    };

    context.heartbeat('Grading single pick');

    const result = await gradeSinglePickAdapter(pickId, safeConfig);

    logger.info('Single pick grading activity completed', {
      activityId,
      pickId,
      success: result !== null,
      score: result?.gradingResult.totalScore,
      tier: result?.gradingResult.tier,
    });

    return result;

  } catch (error) {
    logger.error('Single pick grading activity failed', {
      activityId,
      pickId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Activity: Test grading system connection
 */
export async function testGradingConnection(): Promise<boolean> {
  const context = Context.current();
  const activityId = context.info.activityId;
  
  logger.debug('Testing grading connection', { activityId });

  try {
    context.heartbeat('Testing database connection');

    const result = await testGradingConnectionAdapter();

    logger.debug('Grading connection test completed', {
      activityId,
      success: result,
    });

    return result;

  } catch (error) {
    logger.error('Grading connection test failed', {
      activityId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Activity: Get grading system health status
 */
export async function getGradingHealth(): Promise<{
  healthy: boolean;
  connectionOk: boolean;
  lastUpdate: string;
  stats?: {
    totalGraded: number;
    avgScore: number;
    errorRate: number;
  };
}> {
  const context = Context.current();
  const activityId = context.info.activityId;
  
  try {
    context.heartbeat('Checking grading system health');

    const connectionOk = await testGradingConnectionAdapter();
    
    // Could extend this to check additional health metrics:
    // - Recent grading success rate
    // - Average processing time
    // - Error rates
    // - Database performance

    const health = {
      healthy: connectionOk,
      connectionOk,
      lastUpdate: new Date().toISOString(),
    };

    logger.debug('Grading health check completed', {
      activityId,
      ...health,
    });

    return health;

  } catch (error) {
    logger.error('Grading health check failed', {
      activityId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    return {
      healthy: false,
      connectionOk: false,
      lastUpdate: new Date().toISOString(),
    };
  }
}