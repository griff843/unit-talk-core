/**
 * Grading Adapter - Bridges pure business logic with I/O operations
 * This service is READ-ONLY - does not write to unified_picks (Promoter owns that)
 */

import type { UnifiedPickRow } from '@unit-talk/db';
import { createAnonClient } from '@unit-talk/db';
import type {
  GradingInput,
  GradingResult,
  GradingConfig,
  MarketOutcome,

  FactorCalculatorRegistry} from '@unit-talk/logic';
import {
  gradeProposition,
  gradeBatchPropositions,
  GRADING_CONSTANTS,
} from '@unit-talk/logic';
import { logger } from '@unit-talk/observability';

/**
 * Grading service interface for external configuration
 */
export interface GradingAdapterConfig {
  shadowMode?: boolean;
  qualityThreshold?: number;
  enabledFactors?: string[];
  factorWeights?: Record<string, number>;
  batchSize?: number;
  maxAge?: number; // Max age in minutes for picks to grade
}

/**
 * Grading operation result
 */
export interface GradingOperationResult {
  success: boolean;
  graded: number;
  skipped: number;
  failed: number;
  error?: string;
  gradedPickIds?: string[];
  metadata: {
    totalCandidates: number;
    avgScore: number;
    tierDistribution: Record<string, number>;
    processingTime: number;
    configUsed: GradingConfig;
  };
}

/**
 * Interface for grading outcome determination
 */
export interface GradingWithOutcome {
  gradingResult: GradingResult;
  marketOutcome?: 'win' | 'loss' | 'push' | 'void' | 'pending';
  settledAt?: Date;
}

/**
 * Execute grading workflow for promoted picks
 * READ-ONLY OPERATION - No writes to unified_picks table
 */
export async function executeGradingWorkflow(
  config: GradingAdapterConfig = {}
): Promise<GradingOperationResult> {
  const startTime = Date.now();

  try {
    logger.info('Starting grading workflow', {
      config,
      timestamp: new Date().toISOString(),
    });

    // Step 1: Create grading configuration
    const gradingConfig = createGradingConfig(config);

    // Step 2: Get candidates for grading (recently promoted picks)
    const candidates = await getGradingCandidates(config);

    if (candidates.length === 0) {
      logger.info('No grading candidates found');
      return {
        success: true,
        graded: 0,
        skipped: 0,
        failed: 0,
        metadata: {
          totalCandidates: 0,
          avgScore: 0,
          tierDistribution: {},
          processingTime: Date.now() - startTime,
          configUsed: gradingConfig,
        },
      };
    }

    // Step 3: Execute grading with pure business logic
    const result = await executeGradingLogic(candidates, gradingConfig, config);

    logger.info('Grading workflow completed', {
      graded: result.graded,
      failed: result.failed,
      avgScore: result.metadata.avgScore,
      duration: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Grading workflow failed', {
      error: errorMessage,
      duration: Date.now() - startTime,
    });

    return {
      success: false,
      graded: 0,
      skipped: 0,
      failed: 0,
      error: errorMessage,
      metadata: {
        totalCandidates: 0,
        avgScore: 0,
        tierDistribution: {},
        processingTime: Date.now() - startTime,
        configUsed: createGradingConfig(config),
      },
    };
  }
}

/**
 * Grade a single pick and optionally determine market outcome
 * Pure function wrapper with I/O for data gathering
 */
export async function gradeSinglePick(
  pickId: string,
  config: GradingAdapterConfig = {}
): Promise<GradingWithOutcome | null> {
  try {
    // Get pick data
    const pick = await getPickData(pickId);
    if (!pick) {
      logger.warn('Pick not found for grading', { pickId });
      return null;
    }

    // Convert to grading input
    const gradingInput = convertPickToGradingInput(pick);

    // Gather context data
    const contextData = await gatherContextData(gradingInput);

    // Create grading config
    const gradingConfig = createGradingConfig(config);

    // Execute pure grading logic
    const gradingResult = gradeProposition(
      gradingInput,
      gradingConfig,
      contextData
    );

    // Optionally determine market outcome if result data available
    const outcomeData = await getOutcomeData(pickId);
    let marketOutcome: 'win' | 'loss' | 'push' | 'void' | 'pending' | undefined;
    let settledAt: Date | undefined;

    if (outcomeData) {
      const outcome: MarketOutcome = {
        result: outcomeData.result as any,
        settledAt: outcomeData.settled_at
          ? new Date(outcomeData.settled_at)
          : undefined,
      };

      marketOutcome = gradeMarketOutcome(
        gradingInput,
        outcome,
        outcomeData.result_data
      );
      settledAt = outcome.settledAt;
    }

    return {
      gradingResult,
      marketOutcome,
      settledAt,
    };
  } catch (error) {
    logger.error('Single pick grading failed', {
      pickId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get promoted picks that need grading (read-only operation)
 */
async function getGradingCandidates(
  config: GradingAdapterConfig
): Promise<UnifiedPickRow[]> {
  const anonClient = createAnonClient();
  const maxAgeMinutes = config.maxAge || 1440; // Default 24 hours
  const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const batchSize = config.batchSize || 100;

  try {
    logger.debug('Fetching grading candidates', {
      cutoffTime: cutoffTime.toISOString(),
      maxAge: maxAgeMinutes,
      batchSize,
    });

    // Query for recently promoted picks that haven't been graded
    const { data, error } = await anonClient
      .from('unified_picks')
      .select('*')
      .not('promoted_at', 'is', null) // Only promoted items
      .gte('promoted_at', cutoffTime.toISOString()) // Recent promotions
      .is('graded_at', null) // Not yet graded
      .order('promoted_at', { ascending: false })
      .limit(batchSize);

    if (error) {
      throw new Error(`Failed to fetch grading candidates: ${error.message}`);
    }

    if (!data || data.length === 0) {
      logger.debug('No grading candidates found');
      return [];
    }

    logger.info('Fetched grading candidates', { count: data.length });
    return data as UnifiedPickRow[];
  } catch (error) {
    logger.error('Failed to get grading candidates', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Execute grading logic for a batch of candidates
 */
async function executeGradingLogic(
  candidates: UnifiedPickRow[],
  gradingConfig: GradingConfig,
  adapterConfig: GradingAdapterConfig
): Promise<GradingOperationResult> {
  const startTime = Date.now();

  try {
    // Convert candidates to grading inputs
    const gradingInputs: GradingInput[] = candidates.map(
      convertPickToGradingInput
    );

    // Gather context data for all picks (could be optimized with bulk queries)
    const contextData: Record<string, Record<string, unknown>> = {};

    for (const input of gradingInputs) {
      try {
        contextData[input.pickId] = await gatherContextData(input);
      } catch (error) {
        logger.warn('Failed to gather context data for pick', {
          pickId: input.pickId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without context data for this pick
      }
    }

    // Execute pure grading logic in batch
    const batchResult = gradeBatchPropositions(
      gradingInputs,
      gradingConfig,
      contextData
    );

    // In shadow mode, we don't persist grades - just compute them
    if (gradingConfig.shadowMode) {
      logger.info('Shadow mode - grades computed but not persisted', {
        computed: batchResult.results.length,
        avgScore: batchResult.summary.avgScore,
      });

      return {
        success: true,
        graded: batchResult.results.length,
        skipped: 0,
        failed: batchResult.errors.length,
        gradedPickIds: batchResult.results.map(r => r.pickId),
        metadata: {
          totalCandidates: candidates.length,
          avgScore: batchResult.summary.avgScore,
          tierDistribution: batchResult.summary.tierDistribution,
          processingTime: Date.now() - startTime,
          configUsed: gradingConfig,
        },
      };
    }

    // TODO: In production mode, would persist grades to a grading table
    // For now, log the results
    batchResult.results.forEach(result => {
      logger.info('Pick graded', {
        pickId: result.pickId,
        score: result.totalScore,
        tier: result.tier,
        confidence: result.confidenceLevel,
      });
    });

    batchResult.errors.forEach(error => {
      logger.error('Pick grading error', error);
    });

    return {
      success: true,
      graded: batchResult.results.length,
      skipped: 0,
      failed: batchResult.errors.length,
      gradedPickIds: batchResult.results.map(r => r.pickId),
      metadata: {
        totalCandidates: candidates.length,
        avgScore: batchResult.summary.avgScore,
        tierDistribution: batchResult.summary.tierDistribution,
        processingTime: Date.now() - startTime,
        configUsed: gradingConfig,
      },
    };
  } catch (error) {
    logger.error('Grading logic execution failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get individual pick data
 */
async function getPickData(pickId: string): Promise<UnifiedPickRow | null> {
  const anonClient = createAnonClient();

  try {
    const { data, error } = await anonClient
      .from('unified_picks')
      .select('*')
      .eq('id', pickId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to fetch pick data: ${error.message}`);
    }

    return data as UnifiedPickRow;
  } catch (error) {
    logger.error('Failed to get pick data', {
      pickId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get outcome data for a pick (from result_sets or grades)
 */
async function getOutcomeData(pickId: string): Promise<any> {
  // This would typically query result_sets or pick_grades tables
  // For now, return null to indicate no outcome data available
  return null;
}

/**
 * Convert unified pick to grading input format
 */
function convertPickToGradingInput(pick: UnifiedPickRow): GradingInput {
  const payload = pick.data || {};

  return {
    pickId: pick.id,
    tenantId: payload.tenant_id || 'default',
    sport: payload.sport || 'MLB',
    league: payload.league,
    player: payload.player_id,
    gameId: payload.game_id,
    team: payload.team,
    opponent: payload.opponent,
    marketType: payload.market_type || payload.type || 'unknown',
    odds: payload.odds,
    line: payload.line,
    eventId: payload.event_id,
    selection: payload.selection,
    data: payload,
  };
}

/**
 * Gather context data for grading
 * This would typically fetch from various data sources
 */
async function gatherContextData(
  input: GradingInput
): Promise<Record<string, unknown>> {
  // In a full implementation, this would gather:
  // - Historical player/team statistics
  // - Market data and odds movement
  // - Weather and situational factors
  // - Injury reports
  // - Recent performance trends

  // For now, return minimal context to demonstrate the pattern
  return {
    historical: {
      playerStats: {
        // Would query stats API or database
        battingAverage: 0.275, // Example data
        onBasePercentage: 0.34,
      },
    },
    team: {
      team: { winRate: 0.52 },
      opponent: { winRate: 0.48 },
      isHome: input.data?.is_home || false,
    },
    market: {
      odds: input.odds,
      volume: 5000, // Example market volume
    },
    situational: {
      weather: { temperature: 72, windSpeed: 5 },
      injuries: [],
      daysRest: 1,
    },
  };
}

/**
 * Create grading configuration using new constants and factor system
 */
function createGradingConfig(config: GradingAdapterConfig): GradingConfig {
  const availableFactors = FactorCalculatorRegistry.getAvailableFactors();

  return {
    version: GRADING_CONSTANTS.DEFAULT_VERSION,
    enabledFactors: config.enabledFactors || availableFactors.slice(0, 20), // Use top 20 factors by default
    factorWeights: {
      ...GRADING_CONSTANTS.FACTOR_WEIGHTS,
      ...config.factorWeights,
    },
    tierThresholds: GRADING_CONSTANTS.TIER_THRESHOLDS,
    qualityThreshold:
      config.qualityThreshold || GRADING_CONSTANTS.DEFAULT_QUALITY_THRESHOLD,
    shadowMode: config.shadowMode || false,
  };
}

/**
 * Utility function for health checks and testing
 */
export async function testGradingConnection(): Promise<boolean> {
  try {
    const anonClient = createAnonClient();

    // Test basic query
    const { error } = await anonClient
      .from('unified_picks')
      .select('count(*)' as any, { count: 'exact', head: true });

    if (error) {
      throw new Error(`Database connection test failed: ${error.message}`);
    }

    logger.debug('Grading connection test successful');
    return true;
  } catch (error) {
    logger.error('Grading connection test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
