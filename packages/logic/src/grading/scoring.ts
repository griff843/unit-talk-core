/**
 * Main scoring orchestration - pure business logic
 * No I/O operations, fully deterministic and testable
 */

import { calculateAllFactors, validateFactorResults } from './features.js';
import {
  calculateCompositeScore,
  determineTier,
  applyQualityFilters,
  validateGradingConfig,
  calculateEdgeScore,
  calculateRiskScore,
} from './rules.js';
import type { GradingInput, GradingResult, GradingConfig } from './types.js';
import { GradingError, GRADING_CONSTANTS } from './types.js';

/**
 * Main grading orchestration function
 * Pure function - given same inputs, produces same outputs
 */
export function gradeProposition(
  input: GradingInput,
  config: GradingConfig,
  contextData?: Record<string, unknown>
): GradingResult {
  const processedAt = new Date();

  // Validate configuration
  const configValidation = validateGradingConfig(config);
  if (!configValidation.valid) {
    throw new GradingError(
      `Invalid grading configuration: ${configValidation.errors.join(', ')}`,
      'INVALID_CONFIG'
    );
  }

  // Validate required input fields
  if (!input.pickId || !input.sport || !input.marketType) {
    throw new GradingError(
      'Missing required input fields: pickId, sport, marketType',
      'INVALID_INPUT',
      input.pickId
    );
  }

  // Calculate all factor results
  const factorResults = calculateAllFactors(input, config, contextData);

  // Validate factor results
  if (!validateFactorResults(factorResults)) {
    throw new GradingError(
      'Factor calculation produced invalid results',
      'INVALID_FACTORS',
      input.pickId
    );
  }

  // Calculate composite scores
  const { totalScore, confidenceLevel, qualityScore } = calculateCompositeScore(
    factorResults,
    config
  );

  // Determine tier
  const tier = determineTier(totalScore, confidenceLevel, config);

  // Calculate additional metrics
  const edgeScore = calculateEdgeScore(totalScore);
  const riskScore = calculateRiskScore(factorResults, confidenceLevel);

  // Create factor breakdown
  const factorBreakdown = factorResults.reduce(
    (breakdown, factor) => {
      breakdown[factor.factorId] = factor.contribution;
      return breakdown;
    },
    {} as Record<string, number>
  );

  // Build result
  const result: GradingResult = {
    pickId: input.pickId,
    totalScore,
    tier,
    confidenceLevel,
    factorBreakdown,
    gradingMetadata: {
      version: config.version,
      processedAt,
      factorsApplied: factorResults.map(f => f.factorId),
      qualityScore,
    },
    edgeScore,
    riskScore,
  };

  // Apply quality filters
  const qualityCheck = applyQualityFilters(result, config);
  if (!qualityCheck.passed && !config.shadowMode) {
    throw new GradingError(
      `Quality check failed: ${qualityCheck.reasons.join(', ')}`,
      'QUALITY_CHECK_FAILED',
      input.pickId
    );
  }

  return result;
}

/**
 * Grade multiple propositions in batch
 * Pure function - processes array of inputs
 */
export function gradeBatchPropositions(
  inputs: GradingInput[],
  config: GradingConfig,
  contextData?: Record<string, Record<string, unknown>>
): {
  results: GradingResult[];
  errors: Array<{ pickId: string; error: string; code: string }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    avgScore: number;
    tierDistribution: Record<string, number>;
  };
} {
  const results: GradingResult[] = [];
  const errors: Array<{ pickId: string; error: string; code: string }> = [];

  // Process each input
  for (const input of inputs) {
    try {
      const inputContextData = contextData?.[input.pickId];
      const result = gradeProposition(input, config, inputContextData);
      results.push(result);
    } catch (error) {
      const gradingError = error as GradingError;
      errors.push({
        pickId: input.pickId,
        error: gradingError.message,
        code: gradingError.code,
      });
    }
  }

  // Calculate summary statistics
  const avgScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.totalScore, 0) / results.length
      : 0;

  const tierDistribution = results.reduce(
    (dist, result) => {
      dist[result.tier] = (dist[result.tier] || 0) + 1;
      return dist;
    },
    {} as Record<string, number>
  );

  return {
    results,
    errors,
    summary: {
      total: inputs.length,
      successful: results.length,
      failed: errors.length,
      avgScore,
      tierDistribution,
    },
  };
}

/**
 * Compare two grading results for differences
 * Pure function - useful for testing and validation
 */
export function compareGradingResults(
  result1: GradingResult,
  result2: GradingResult,
  tolerance = 0.01
): {
  identical: boolean;
  differences: Array<{
    field: string;
    value1: unknown;
    value2: unknown;
    significant: boolean;
  }>;
} {
  const differences: Array<{
    field: string;
    value1: unknown;
    value2: unknown;
    significant: boolean;
  }> = [];

  // Compare scores
  if (Math.abs(result1.totalScore - result2.totalScore) > tolerance) {
    differences.push({
      field: 'totalScore',
      value1: result1.totalScore,
      value2: result2.totalScore,
      significant: true,
    });
  }

  // Compare confidence
  if (Math.abs(result1.confidenceLevel - result2.confidenceLevel) > tolerance) {
    differences.push({
      field: 'confidenceLevel',
      value1: result1.confidenceLevel,
      value2: result2.confidenceLevel,
      significant: true,
    });
  }

  // Compare tiers
  if (result1.tier !== result2.tier) {
    differences.push({
      field: 'tier',
      value1: result1.tier,
      value2: result2.tier,
      significant: true,
    });
  }

  // Compare factor breakdowns
  const factors1 = Object.keys(result1.factorBreakdown).sort();
  const factors2 = Object.keys(result2.factorBreakdown).sort();

  if (factors1.join(',') !== factors2.join(',')) {
    differences.push({
      field: 'factorBreakdown.keys',
      value1: factors1,
      value2: factors2,
      significant: true,
    });
  } else {
    for (const factorId of factors1) {
      const diff = Math.abs(
        result1.factorBreakdown[factorId] - result2.factorBreakdown[factorId]
      );
      if (diff > tolerance) {
        differences.push({
          field: `factorBreakdown.${factorId}`,
          value1: result1.factorBreakdown[factorId],
          value2: result2.factorBreakdown[factorId],
          significant: true,
        });
      }
    }
  }

  return {
    identical: differences.filter(d => d.significant).length === 0,
    differences,
  };
}

/**
 * Create a deterministic grading result for testing
 * Pure function - useful for generating test data
 */
export function createTestGradingResult(
  pickId: string,
  score: number,
  overrides: Partial<GradingResult> = {}
): GradingResult {
  const config = {
    version: GRADING_CONSTANTS.DEFAULT_VERSION,
    enabledFactors: ['test_factor'],
    factorWeights: { test_factor: 1.0 },
    tierThresholds: GRADING_CONSTANTS.TIER_THRESHOLDS,
    qualityThreshold: 0.7,
  };

  const tier = determineTier(score, overrides.confidenceLevel || 0.8, config);

  return {
    pickId,
    totalScore: score,
    tier,
    confidenceLevel: 0.8,
    factorBreakdown: { test_factor: score },
    gradingMetadata: {
      version: GRADING_CONSTANTS.DEFAULT_VERSION,
      processedAt: new Date('2025-01-01T00:00:00Z'),
      factorsApplied: ['test_factor'],
      qualityScore: 0.9,
    },
    edgeScore: calculateEdgeScore(score),
    riskScore: 20,
    ...overrides,
  };
}
