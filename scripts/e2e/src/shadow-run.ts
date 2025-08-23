#!/usr/bin/env tsx

/**
 * Shadow run E2E test for promoter workflow
 * Seeds canary → runs promoter → validates non-zero promotions
 * Outputs JSON result for acceptance harness
 */

import { execSync } from 'child_process';
import { logger } from '@unit-talk/observability';
import { executePromoterWorkflow } from '../../../apps/worker/temporal/src/adapters/promoterAdapter.js';
import { createAnonClient } from '@unit-talk/db';
import { getConfig } from '@unit-talk/config';

interface ShadowRunResult {
  success: boolean;
  timestamp: string;
  results: {
    canary_seeded: boolean;
    promoter_executed: boolean;
    promotions_count: number;
    flood_guard_triggered: boolean;
    validation_passed: boolean;
  };
  metrics: {
    raw_new: number;
    processed: number;
    promoted: number;
  };
  error?: string;
  details?: any;
}

async function runShadowTest(): Promise<ShadowRunResult> {
  const startTime = new Date();
  
  try {
    logger.info('Starting shadow run E2E test', { timestamp: startTime.toISOString() });
    
    // Step 1: Seed canary data if needed
    logger.info('Seeding canary data...');
    await seedCanaryData();
    
    // Step 2: Verify canary exists
    const canaryCount = await getCanaryCount();
    if (canaryCount === 0) {
      throw new Error('Canary seeding failed - no canary data found');
    }
    
    logger.info('Canary data verified', { count: canaryCount });
    
    // Step 3: Run promoter workflow in dry-run mode for shadow testing
    logger.info('Executing promoter workflow (shadow mode)...');
    const promoterResult = await executePromoterWorkflow({
      maxPromotionsPerWindow: 20, // Use default flood guard
      windowSizeMinutes: 5,
      minQualityThreshold: 0.5, // Lower threshold for testing
      maxAgeHours: 2, // Accept recent canary data
      dryRun: false, // Actually promote in shadow (will be cleaned up)
    });
    
    if (!promoterResult.success) {
      throw new Error(`Promoter workflow failed: ${promoterResult.error}`);
    }
    
    logger.info('Promoter workflow completed', {
      promoted: promoterResult.promoted,
      rejected: promoterResult.rejected,
      floodGuard: promoterResult.floodGuardTriggered
    });
    
    // Step 4: Get final metrics
    const metrics = await getSystemMetrics();
    
    // Step 5: Validate results
    const validationPassed = validateResults(promoterResult, metrics);
    
    const result: ShadowRunResult = {
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        canary_seeded: canaryCount > 0,
        promoter_executed: promoterResult.success,
        promotions_count: promoterResult.promoted,
        flood_guard_triggered: promoterResult.floodGuardTriggered,
        validation_passed: validationPassed,
      },
      metrics: {
        raw_new: metrics.rawCount,
        processed: metrics.processedCount,
        promoted: metrics.promotedCount,
      },
      details: {
        promoterResult,
        systemMetrics: metrics,
        duration: Date.now() - startTime.getTime(),
      },
    };
    
    logger.info('Shadow run completed successfully', result);
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Shadow run failed', { error: errorMessage });
    
    return {
      success: false,
      timestamp: new Date().toISOString(),
      results: {
        canary_seeded: false,
        promoter_executed: false,
        promotions_count: 0,
        flood_guard_triggered: false,
        validation_passed: false,
      },
      metrics: {
        raw_new: 0,
        processed: 0,
        promoted: 0,
      },
      error: errorMessage,
    };
  }
}

async function seedCanaryData(): Promise<void> {
  try {
    const config = getConfig();
    const command = `psql "${config.DATABASE_URL}" -f scripts/db/seed-canary.sql`;
    
    logger.debug('Executing canary seed command', { command: command.replace(config.DATABASE_URL, '<DATABASE_URL>') });
    
    const output = execSync(command, { encoding: 'utf-8' });
    
    logger.debug('Canary seed output', { output });
    
  } catch (error) {
    logger.error('Canary seeding failed', { error: error instanceof Error ? error.message : String(error) });
    throw new Error(`Failed to seed canary data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getCanaryCount(): Promise<number> {
  try {
    const client = createAnonClient();
    
    const { data, error } = await client
      .from('raw_props')
      .select('id', { count: 'exact', head: true })
      .eq('data->>type', 'canary_test')
      .gte('inserted_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()); // Last 2 hours
    
    if (error) {
      throw new Error(`Failed to count canary data: ${error.message}`);
    }
    
    return data?.length ?? 0;
    
  } catch (error) {
    logger.error('Failed to get canary count', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

interface SystemMetrics {
  rawCount: number;
  processedCount: number;
  promotedCount: number;
  windowStart: string;
}

async function getSystemMetrics(): Promise<SystemMetrics> {
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
    logger.error('Failed to get system metrics', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

function validateResults(promoterResult: any, metrics: SystemMetrics): boolean {
  try {
    // Validation 1: Promoter must have succeeded
    if (!promoterResult.success) {
      logger.error('Validation failed: promoter workflow did not succeed');
      return false;
    }
    
    // Validation 2: Must have promoted at least one item (non-zero)
    if (promoterResult.promoted === 0) {
      logger.error('Validation failed: zero promotions - promoter must promote non-zero items');
      return false;
    }
    
    // Validation 3: Promoted count should not exceed flood guard limit
    if (promoterResult.promoted > 20) {
      logger.error('Validation failed: promoted count exceeds flood guard limit', {
        promoted: promoterResult.promoted,
        limit: 20
      });
      return false;
    }
    
    // Validation 4: System metrics should be consistent
    if (metrics.promotedCount < promoterResult.promoted) {
      logger.error('Validation failed: system metrics inconsistent with promoter result', {
        systemPromoted: metrics.promotedCount,
        promoterPromoted: promoterResult.promoted
      });
      return false;
    }
    
    logger.info('All validations passed', {
      promoted: promoterResult.promoted,
      systemMetrics: metrics
    });
    
    return true;
    
  } catch (error) {
    logger.error('Validation error', { error: error instanceof Error ? error.message : String(error) });
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
    if (!result.success || result.results.promotions_count === 0) {
      logger.error('Shadow run failed or no promotions', {
        success: result.success,
        promotions: result.results.promotions_count
      });
      process.exit(1);
    }
    
    logger.info('Shadow run successful', {
      promoted: result.results.promotions_count,
      metrics: result.metrics
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