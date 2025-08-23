/**
 * Promoter Adapter - Bridges pure business logic with I/O operations
 * This is the ONLY service authorized to write to unified_picks table
 */

import { config as systemConfig } from '@unit-talk/config';
import type { UnifiedPickInsert } from '@unit-talk/db';
import {
  withPromoterClient,
  insertUnifiedPicksBatch,
  countPromotionsInWindow,
  getExistingPromotions,
 createAnonClient } from '@unit-talk/db';
import type { RawPropsRow, PromotionConfig } from '@unit-talk/logic';
import {
  selectCandidatesForPromotion,
  createDefaultPromotionConfig,
  ensureIdempotency,
} from '@unit-talk/logic';
import { logger } from '@unit-talk/observability';
import type { PoolClient } from 'pg';

/**
 * Promoter service interface for external configuration
 */
export interface PromoterConfig {
  maxPromotionsPerWindow?: number;
  windowSizeMinutes?: number;
  minQualityThreshold?: number;
  maxAgeHours?: number;
  dryRun?: boolean; // For testing - don't actually insert
}

/**
 * Main promoter operation result
 */
export interface PromoterOperationResult {
  success: boolean;
  promoted: number;
  rejected: number;
  floodGuardTriggered: boolean;
  shadowModeBlocked: boolean;
  error?: string;
  promotedIds?: string[];
  metadata: {
    totalCandidates: number;
    windowStart: string;
    windowEnd: string;
    configUsed: PromotionConfig;
  };
}

/**
 * Execute promotion workflow
 * SINGLE WRITER PATTERN - Only this function writes to unified_picks
 */
export async function executePromoterWorkflow(
  config: PromoterConfig = {}
): Promise<PromoterOperationResult> {
  const startTime = new Date();

  try {
    logger.info('Starting promoter workflow', {
      config,
      timestamp: startTime.toISOString(),
    });

    // Step 1: Create promotion configuration
    const promotionConfig = createDefaultPromotionConfig({
      maxPromotionsPerWindow: config.maxPromotionsPerWindow,
      windowSizeMinutes: config.windowSizeMinutes,
      minQualityThreshold: config.minQualityThreshold,
      maxAgeHours: config.maxAgeHours,
    });

    // Step 2: Read candidates using read-only client (no promoter role needed)
    const candidates = await getCandidatesForPromotion(
      promotionConfig,
      startTime
    );

    if (candidates.length === 0) {
      logger.info('No candidates found for promotion');
      return {
        success: true,
        promoted: 0,
        rejected: 0,
        floodGuardTriggered: false,
        shadowModeBlocked: false,
        metadata: {
          totalCandidates: 0,
          windowStart: startTime.toISOString(),
          windowEnd: startTime.toISOString(),
          configUsed: promotionConfig,
        },
      };
    }

    // Step 3: Execute promotion with promoter client (SINGLE WRITER)
    const result = await withPromoterClient(async promoterClient => {
      return await executePromotionWithClient(
        promoterClient,
        candidates,
        promotionConfig,
        startTime,
        config.dryRun
      );
    });

    logger.info('Promoter workflow completed', {
      promoted: result.promoted,
      rejected: result.rejected,
      floodGuardTriggered: result.floodGuardTriggered,
      shadowModeBlocked: result.shadowModeBlocked,
      duration: Date.now() - startTime.getTime(),
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Promoter workflow failed', {
      error: errorMessage,
      duration: Date.now() - startTime.getTime(),
    });

    return {
      success: false,
      promoted: 0,
      rejected: 0,
      floodGuardTriggered: false,
      shadowModeBlocked: false,
      error: errorMessage,
      metadata: {
        totalCandidates: 0,
        windowStart: startTime.toISOString(),
        windowEnd: startTime.toISOString(),
        configUsed: createDefaultPromotionConfig(config),
      },
    };
  }
}

/**
 * Read promotion candidates from database (read-only operation)
 * Uses anon client - no special permissions needed for reading
 */
async function getCandidatesForPromotion(
  config: PromotionConfig,
  currentTime: Date
): Promise<RawPropsRow[]> {
  const anonClient = createAnonClient();
  const cutoffTime = new Date(
    currentTime.getTime() - config.maxAgeHours * 60 * 60 * 1000
  );

  try {
    logger.debug('Fetching promotion candidates', {
      cutoffTime: cutoffTime.toISOString(),
      maxAge: config.maxAgeHours,
    });

    // Query for processed candidates within age limit
    const { data, error } = await anonClient
      .from('raw_props')
      .select('id, inserted_at, processed_at, data')
      .not('processed_at', 'is', null) // Only processed items
      .gte('inserted_at', cutoffTime.toISOString()) // Within age limit
      .order('inserted_at', { ascending: false })
      .limit(1000); // Reasonable batch size

    if (error) {
      throw new Error(`Failed to fetch candidates: ${error.message}`);
    }

    if (!data || data.length === 0) {
      logger.debug('No promotion candidates found');
      return [];
    }

    logger.info('Fetched promotion candidates', { count: data.length });
    return data as RawPropsRow[];
  } catch (error) {
    logger.error('Failed to get candidates for promotion', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Execute promotion logic with promoter client
 * CRITICAL: Only this function has write access to unified_picks
 */
async function executePromotionWithClient(
  promoterClient: PoolClient,
  candidates: RawPropsRow[],
  config: PromotionConfig,
  currentTime: Date,
  dryRun = false
): Promise<PromoterOperationResult> {
  try {
    // Step 1: Get existing promotions for deduplication
    const candidateIds = candidates.map(c => c.id);
    const existingPromotions = await getExistingPromotions(
      promoterClient,
      candidateIds
    );
    const existingRawIds = existingPromotions.map(p => p.raw_id);

    logger.debug('Existing promotions check', {
      candidates: candidateIds.length,
      existing: existingRawIds.length,
    });

    // Step 2: Count current promotions in window (flood guard)
    const windowStart = new Date(
      currentTime.getTime() - config.windowSizeMinutes * 60 * 1000
    );
    const currentPromotionsCount = await countPromotionsInWindow(
      promoterClient,
      windowStart
    );

    logger.debug('Flood guard check', {
      currentPromotions: currentPromotionsCount,
      limit: config.maxPromotionsPerWindow,
    });

    // Step 3: Apply pure business logic (no I/O)
    const promotionResult = selectCandidatesForPromotion(
      candidates,
      existingRawIds,
      config,
      currentTime
    );

    // Step 4: Apply final idempotency check
    const finalCandidates = ensureIdempotency(
      promotionResult.selectedCandidates,
      existingPromotions
    );

    logger.info('Promotion selection completed', {
      selected: finalCandidates.length,
      rejected: promotionResult.rejectedCandidates.length,
      floodGuardTriggered: promotionResult.floodGuardTriggered,
    });

    let promotedIds: string[] = [];
    let shadowModeBlocked = false;

    // Step 5: Shadow mode gate - check if promotion is allowed
    const { shadowMode, allowPromotionInShadow } = systemConfig.features;
    const shouldBlockPromotion = shadowMode && !allowPromotionInShadow;

    if (shouldBlockPromotion && finalCandidates.length > 0) {
      shadowModeBlocked = true;
      logger.info('SHADOW MODE: Blocking promotion to unified_picks', {
        candidateCount: finalCandidates.length,
        shadowMode,
        allowPromotionInShadow,
        message: 'Set ALLOW_PROMOTION_IN_SHADOW=true to enable DB writes in shadow mode'
      });
      
      // In shadow mode with no promotion allowed, we simulate the promotion
      promotedIds = finalCandidates.map(c => `shadow-blocked-${c.rawId}`);
    }
    // Step 6: Execute writes (SINGLE WRITER PATTERN)
    else if (finalCandidates.length > 0 && !dryRun) {
      const picksToInsert: UnifiedPickInsert[] = finalCandidates.map(
        candidate => ({
          raw_id: candidate.rawId,
          data: candidate.payload,
          promoted_at: currentTime,
        })
      );

      const insertedPicks = await insertUnifiedPicksBatch(
        promoterClient,
        picksToInsert
      );
      promotedIds = insertedPicks.map(p => p.id);

      logger.info('Unified picks inserted', {
        count: insertedPicks.length,
        ids: promotedIds,
        shadowMode,
        allowPromotionInShadow,
      });
    } else if (dryRun) {
      logger.info('DRY RUN - Would have promoted', {
        count: finalCandidates.length,
      });
      promotedIds = finalCandidates.map(c => `dry-run-${c.rawId}`);
    }

    return {
      success: true,
      promoted: shadowModeBlocked ? 0 : finalCandidates.length,
      rejected: promotionResult.rejectedCandidates.length,
      floodGuardTriggered: promotionResult.floodGuardTriggered,
      shadowModeBlocked,
      promotedIds,
      metadata: {
        totalCandidates: candidates.length,
        windowStart: windowStart.toISOString(),
        windowEnd: currentTime.toISOString(),
        configUsed: config,
      },
    };
  } catch (error) {
    logger.error('Promotion execution failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Utility function for health checks and testing
 */
export async function testPromoterConnection(): Promise<boolean> {
  try {
    await withPromoterClient(async client => {
      // Test basic query with promoter role
      const result = await client.query(
        "SELECT current_setting('app.role', true) as role, NOW() as timestamp"
      );
      const row = result.rows[0];

      if (row.role !== 'promoter') {
        throw new Error(`Expected promoter role, got: ${row.role}`);
      }

      logger.debug('Promoter connection test successful', {
        role: row.role,
        timestamp: row.timestamp,
      });
    });

    return true;
  } catch (error) {
    logger.error('Promoter connection test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
