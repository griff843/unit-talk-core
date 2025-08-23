#!/usr/bin/env tsx

/**
 * Shadow run E2E test for complete ingestion pipeline
 * Feed → Processor → Promoter with parity validation
 * Validates raw_new ≥ processed ≥ promoted and non-zero promotions
 * Outputs JSON result for acceptance harness
 */

import { execSync } from 'child_process';
import { logger } from '@unit-talk/observability';
import { executePromoterWorkflow } from '../../../apps/worker/temporal/src/adapters/promoterAdapter.js';
import { executeFeedWorkflow, getRawPropsStatistics } from '../../../apps/worker/temporal/src/adapters/feedAdapter.js';
import { executeGradingWorkflow } from '../../../apps/worker/temporal/src/adapters/gradingAdapter.js';
import { createAnonClient } from '@unit-talk/db';
import { getConfig } from '@unit-talk/config';

interface ShadowRunResult {
  success: boolean;
  timestamp: string;
  results: {
    feed_executed: boolean;
    promoter_executed: boolean;
    grading_executed: boolean;
    ingestion_count: number;
    processing_count: number;
    promotions_count: number;
    graded_count: number;
    parity_validation: boolean;
    flood_guard_triggered: boolean;
    pipeline_validation_passed: boolean;
  };
  metrics: {
    raw_new_5min: number;
    processed_5min: number;
    promoted_5min: number;
    graded_5min: number;
    parity_check: {
      raw_ge_processed: boolean;
      processed_ge_promoted: boolean;
      overall_parity: boolean;
    };
  };
  error?: string;
  details?: any;
}

async function runShadowTest(): Promise<ShadowRunResult> {
  const startTime = new Date();
  
  try {
    logger.info('Starting complete pipeline shadow run E2E test', { timestamp: startTime.toISOString() });
    
    // Step 1: Execute Feed workflow (ingestion + processing)
    logger.info('Executing feed workflow (ingestion + processing)...');
    const feedResult = await executeFeedWorkflow({
      enableDeduplication: true,
      minQualityScore: 0.3, // Lower threshold for testing
      batchSize: 5,
      maxItemsPerRun: 10,
      dryRun: false, // Actually insert for full pipeline test
    });
    
    if (!feedResult.success) {
      throw new Error(`Feed workflow failed: ${feedResult.error}`);
    }
    
    logger.info('Feed workflow completed', {
      ingested: feedResult.ingested,
      processed: feedResult.processed,
      rejected: feedResult.rejected,
    });
    
    // Step 2: Wait a moment for database consistency
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 3: Get initial pipeline metrics
    const initialMetrics = await getPipelineMetrics();
    logger.info('Initial pipeline metrics', initialMetrics);
    
    // Step 4: Run promoter workflow
    logger.info('Executing promoter workflow...');
    const promoterResult = await executePromoterWorkflow({
      maxPromotionsPerWindow: 20, // Use default flood guard
      windowSizeMinutes: 5,
      minQualityThreshold: 0.3, // Lower threshold for testing
      maxAgeHours: 2, // Accept recent data
      dryRun: false, // Actually promote for full pipeline test
    });
    
    if (!promoterResult.success) {
      throw new Error(`Promoter workflow failed: ${promoterResult.error}`);
    }
    
    logger.info('Promoter workflow completed', {
      promoted: promoterResult.promoted,
      rejected: promoterResult.rejected,
      floodGuard: promoterResult.floodGuardTriggered
    });
    
    // Step 5: Wait a moment for database consistency
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 6: Run grading workflow (shadow mode by default)
    logger.info('Executing grading workflow...');
    const gradingResult = await executeGradingWorkflow({
      shadowMode: true, // Shadow mode - no writes
      qualityThreshold: 0.5, // Lower threshold for testing
      batchSize: 10,
      maxAge: 60, // 1 hour max age
    });
    
    if (!gradingResult.success) {
      logger.warn(`Grading workflow failed: ${gradingResult.error}`);
      // Don't fail the entire pipeline for grading failures in shadow mode
    }
    
    logger.info('Grading workflow completed', {
      graded: gradingResult.graded,
      failed: gradingResult.failed,
      avgScore: gradingResult.metadata.avgScore,
    });
    
    // Step 7: Get final pipeline metrics
    const finalMetrics = await getPipelineMetrics();
    logger.info('Final pipeline metrics', finalMetrics);
    
    // Step 8: Validate parity constraints
    const parityCheck = validatePipelineParity(finalMetrics);
    const pipelineValidation = validatePipelineResults(feedResult, promoterResult, gradingResult, finalMetrics, parityCheck);
    
    const result: ShadowRunResult = {
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        feed_executed: feedResult.success,
        promoter_executed: promoterResult.success,
        grading_executed: gradingResult.success,
        ingestion_count: feedResult.ingested,
        processing_count: feedResult.processed,
        promotions_count: promoterResult.promoted,
        graded_count: gradingResult.graded,
        parity_validation: parityCheck.overall_parity,
        flood_guard_triggered: promoterResult.floodGuardTriggered,
        pipeline_validation_passed: pipelineValidation,
      },
      metrics: {
        raw_new_5min: finalMetrics.rawCount,
        processed_5min: finalMetrics.processedCount,
        promoted_5min: finalMetrics.promotedCount,
        graded_5min: gradingResult.graded, // Shadow mode graded count
        parity_check: parityCheck,
      },
      details: {
        feedResult,
        promoterResult,
        gradingResult,
        initialMetrics,
        finalMetrics,
        duration: Date.now() - startTime.getTime(),
      },
    };
    
    logger.info('Complete pipeline shadow run completed successfully', result.results);
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Pipeline shadow run failed', { error: errorMessage });
    
    return {
      success: false,
      timestamp: new Date().toISOString(),
      results: {
        feed_executed: false,
        promoter_executed: false,
        grading_executed: false,
        ingestion_count: 0,
        processing_count: 0,
        promotions_count: 0,
        graded_count: 0,
        parity_validation: false,
        flood_guard_triggered: false,
        pipeline_validation_passed: false,
      },
      metrics: {
        raw_new_5min: 0,
        processed_5min: 0,
        promoted_5min: 0,
        graded_5min: 0,
        parity_check: {
          raw_ge_processed: false,
          processed_ge_promoted: false,
          overall_parity: false,
        },
      },
      error: errorMessage,
    };
  }
}

// Remove canary seeding functions - we now use feed workflow for data generation

interface PipelineMetrics {
  rawCount: number;
  processedCount: number;
  promotedCount: number;
  windowStart: string;
}

async function getPipelineMetrics(): Promise<PipelineMetrics> {
  try {
    const client = createAnonClient();
    const windowStart = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    
    // Count raw props in window
    const { data: rawData, error: rawError } = await client
      .from('raw_props')
      .select('id', { count: 'exact', head: true })
      .gte('inserted_at', windowStart.toISOString());
    
    if (rawError) {
      throw new Error(`Failed to count raw props: ${rawError.message}`);
    }
    
    // Count processed in window
    const { data: processedData, error: processedError } = await client
      .from('raw_props')
      .select('id', { count: 'exact', head: true })
      .not('processed_at', 'is', null)
      .gte('inserted_at', windowStart.toISOString());
    
    if (processedError) {
      throw new Error(`Failed to count processed props: ${processedError.message}`);
    }
    
    // Count promoted in window
    const { data: promotedData, error: promotedError } = await client
      .from('unified_picks')
      .select('id', { count: 'exact', head: true })
      .gte('promoted_at', windowStart.toISOString());
    
    if (promotedError) {
      throw new Error(`Failed to count promoted picks: ${promotedError.message}`);
    }
    
    return {
      rawCount: rawData?.length ?? 0,
      processedCount: processedData?.length ?? 0,
      promotedCount: promotedData?.length ?? 0,
      windowStart: windowStart.toISOString(),
    };
    
  } catch (error) {
    logger.error('Failed to get pipeline metrics', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Validate pipeline parity constraints: raw ≥ processed ≥ promoted
 */
function validatePipelineParity(metrics: PipelineMetrics): {
  raw_ge_processed: boolean;
  processed_ge_promoted: boolean;
  overall_parity: boolean;
} {
  const raw_ge_processed = metrics.rawCount >= metrics.processedCount;
  const processed_ge_promoted = metrics.processedCount >= metrics.promotedCount;
  const overall_parity = raw_ge_processed && processed_ge_promoted;
  
  logger.info('Pipeline parity check', {
    raw: metrics.rawCount,
    processed: metrics.processedCount,
    promoted: metrics.promotedCount,
    raw_ge_processed,
    processed_ge_promoted,
    overall_parity,
  });
  
  return {
    raw_ge_processed,
    processed_ge_promoted,
    overall_parity,
  };
}

/**
 * Validate complete pipeline results
 */
function validatePipelineResults(
  feedResult: any,
  promoterResult: any,
  gradingResult: any,
  metrics: PipelineMetrics,
  parityCheck: any
): boolean {
  try {
    // Validation 1: Feed workflow must have succeeded
    if (!feedResult.success) {
      logger.error('Validation failed: feed workflow did not succeed');
      return false;
    }
    
    // Validation 2: Promoter workflow must have succeeded
    if (!promoterResult.success) {
      logger.error('Validation failed: promoter workflow did not succeed');
      return false;
    }
    
    // Validation 3: Must have non-zero ingestion
    if (feedResult.ingested === 0) {
      logger.error('Validation failed: zero ingestion - feed must ingest data');
      return false;
    }
    
    // Validation 4: Must have non-zero processing
    if (feedResult.processed === 0) {
      logger.error('Validation failed: zero processing - feed must process data');
      return false;
    }
    
    // Validation 5: Must have promoted at least one item (CRITICAL)
    if (promoterResult.promoted === 0) {
      logger.error('Validation failed: zero promotions - promoter must promote non-zero items');
      return false;
    }
    
    // Validation 6: Pipeline parity must hold (raw ≥ processed ≥ promoted)
    if (!parityCheck.overall_parity) {
      logger.error('Validation failed: pipeline parity constraint violated', {
        raw: metrics.rawCount,
        processed: metrics.processedCount,
        promoted: metrics.promotedCount,
        parity: parityCheck,
      });
      return false;
    }
    
    // Validation 7: Promoted count should not exceed flood guard limit
    if (promoterResult.promoted > 20) {
      logger.error('Validation failed: promoted count exceeds flood guard limit', {
        promoted: promoterResult.promoted,
        limit: 20
      });
      return false;
    }
    
    // Validation 8: System metrics should be consistent with workflow results
    if (metrics.promotedCount < promoterResult.promoted) {
      logger.error('Validation failed: system metrics inconsistent with promoter result', {
        systemPromoted: metrics.promotedCount,
        promoterPromoted: promoterResult.promoted
      });
      return false;
    }
    
    // Validation 9: Grading should have processed promoted picks (in shadow mode)
    // Note: Grading failures don't fail the entire pipeline, but log for awareness
    if (gradingResult.success) {
      logger.info('Grading validation passed', {
        graded: gradingResult.graded,
        avgScore: gradingResult.metadata.avgScore,
        tierDistribution: gradingResult.metadata.tierDistribution,
      });
    } else {
      logger.warn('Grading validation note: grading workflow failed but does not fail pipeline', {
        error: gradingResult.error,
      });
    }
    
    logger.info('All pipeline validations passed', {
      feedIngested: feedResult.ingested,
      feedProcessed: feedResult.processed,
      promoterPromoted: promoterResult.promoted,
      gradingProcessed: gradingResult.graded,
      systemMetrics: metrics,
      parityCheck,
    });
    
    return true;
    
  } catch (error) {
    logger.error('Pipeline validation error', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

// Main execution
async function main() {
  try {
    const result = await runShadowTest();
    
    // Output JSON for acceptance harness
    console.log(JSON.stringify(result, null, 2));
    
    // Exit with appropriate code
    if (!result.success || result.results.promotions_count === 0 || !result.results.parity_validation) {
      logger.error('Pipeline shadow run failed', {
        success: result.success,
        ingested: result.results.ingestion_count,
        processed: result.results.processing_count,
        promotions: result.results.promotions_count,
        parity: result.results.parity_validation,
      });
      process.exit(1);
    }
    
    logger.info('Complete pipeline shadow run successful', {
      ingested: result.results.ingestion_count,
      processed: result.results.processing_count,
      promoted: result.results.promotions_count,
      parityCheck: result.metrics.parity_check,
    });
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Shadow run execution failed', { 
      error: error instanceof Error ? error.message : String(error)
    });
    
    console.log(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, null, 2));
    
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}