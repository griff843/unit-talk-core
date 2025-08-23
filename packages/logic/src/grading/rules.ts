/**
 * Pure grading rules and scoring logic - no I/O operations
 */

import {
  GradingInput,
  GradingResult,
  GradingConfig,
  FactorResult,
  MarketOutcome,
  GRADING_CONSTANTS,
  GradingError,
} from './types.js';

/**
 * Calculate composite grading score from factor results
 * Pure function - deterministic scoring
 */
export function calculateCompositeScore(
  factors: FactorResult[],
  _config: GradingConfig
): {
  totalScore: number;
  confidenceLevel: number;
  qualityScore: number;
} {
  if (factors.length === 0) {
    return {
      totalScore: GRADING_CONSTANTS.NEUTRAL_SCORE,
      confidenceLevel: 0.1,
      qualityScore: 0.0,
    };
  }

  // Calculate weighted score
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  
  if (totalWeight === 0) {
    throw new GradingError('No factors have positive weights', 'INVALID_WEIGHTS');
  }

  const weightedScore = factors.reduce((sum, factor) => {
    return sum + (factor.score * factor.weight);
  }, 0);

  const totalScore = weightedScore / totalWeight;

  // Calculate confidence level (weighted average of factor confidences)
  const weightedConfidence = factors.reduce((sum, factor) => {
    return sum + (factor.confidence * factor.weight);
  }, 0);
  const confidenceLevel = weightedConfidence / totalWeight;

  // Calculate quality score (consistency and data availability)
  const scoreVariance = calculateScoreVariance(factors);
  const dataQuality = factors.reduce((sum, factor) => {
    return sum + (factor.metadata?.dataAvailable ? 1 : 0.5);
  }, 0) / factors.length;
  
  const qualityScore = Math.min(1.0, dataQuality * (1 - scoreVariance / 100));

  return {
    totalScore: Math.max(0, Math.min(100, totalScore)),
    confidenceLevel: Math.max(0, Math.min(1, confidenceLevel)),
    qualityScore: Math.max(0, Math.min(1, qualityScore)),
  };
}

/**
 * Determine tier based on score and confidence
 * Pure function - consistent tier assignment
 */
export function determineTier(
  score: number,
  confidence: number,
  config: GradingConfig
): 'S' | 'A' | 'B' | 'C' | 'D' {
  // Apply confidence penalty to score for tier determination
  const adjustedScore = score * confidence;
  
  const thresholds = config.tierThresholds;
  
  if (adjustedScore >= thresholds.S && confidence >= 0.8) return 'S';
  if (adjustedScore >= thresholds.A && confidence >= 0.65) return 'A';
  if (adjustedScore >= thresholds.B && confidence >= 0.5) return 'B';
  if (adjustedScore >= thresholds.C && confidence >= 0.3) return 'C';
  return 'D';
}

/**
 * Grade a market outcome based on results
 * Pure function - outcome determination logic
 */
export function gradeMarketOutcome(
  input: GradingInput,
  outcome: MarketOutcome,
  resultData?: Record<string, unknown>
): 'win' | 'loss' | 'push' | 'void' | 'pending' {
  if (outcome.result !== 'pending') {
    return outcome.result;
  }

  // If no explicit outcome, try to determine from result data
  if (!resultData?.outcomes) {
    return 'pending';
  }

  const outcomes = resultData.outcomes as Record<string, string>;
  const selection = input.selection;

  if (selection && outcomes[selection]) {
    const result = outcomes[selection];
    if (['win', 'loss', 'push', 'void'].includes(result)) {
      return result as 'win' | 'loss' | 'push' | 'void';
    }
  }

  return 'pending';
}

/**
 * Apply quality filters to grading results
 * Pure function - quality control
 */
export function applyQualityFilters(
  result: GradingResult,
  config: GradingConfig
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  // Check minimum quality threshold
  if (result.gradingMetadata.qualityScore < config.qualityThreshold) {
    reasons.push(`Quality score ${result.gradingMetadata.qualityScore.toFixed(3)} below threshold ${config.qualityThreshold}`);
  }

  // Check minimum confidence for tier
  const minConfidenceForTier = {
    S: 0.8,
    A: 0.65,
    B: 0.5,
    C: 0.3,
    D: 0.0,
  };

  if (result.confidenceLevel < minConfidenceForTier[result.tier]) {
    reasons.push(`Confidence ${result.confidenceLevel.toFixed(3)} too low for tier ${result.tier}`);
  }

  // Check for extreme scores without sufficient justification
  if ((result.totalScore > 90 || result.totalScore < 10) && result.confidenceLevel < 0.9) {
    reasons.push(`Extreme score ${result.totalScore} requires higher confidence than ${result.confidenceLevel.toFixed(3)}`);
  }

  // Check factor consistency
  const factorScores = Object.values(result.factorBreakdown);
  if (factorScores.length > 1) {
    const variance = calculateVariance(factorScores);
    if (variance > 900) { // High variance in factor scores
      reasons.push(`Factor scores show high variance (${variance.toFixed(1)}), indicating inconsistent analysis`);
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

/**
 * Create default grading configuration
 * Pure function - no environment dependencies
 */
export function createDefaultGradingConfig(
  overrides: Partial<GradingConfig> = {}
): GradingConfig {
  return {
    version: overrides.version || GRADING_CONSTANTS.DEFAULT_VERSION,
    enabledFactors: overrides.enabledFactors || [
      'player_performance',
      'team_context',
      'market_analysis',
      'historical_trends',
      'situational_factors',
    ],
    factorWeights: {
      player_performance: 0.25,
      team_context: 0.2,
      market_analysis: 0.3,
      historical_trends: 0.15,
      situational_factors: 0.1,
      ...overrides.factorWeights,
    },
    tierThresholds: {
      ...GRADING_CONSTANTS.TIER_THRESHOLDS,
      ...overrides.tierThresholds,
    },
    qualityThreshold: overrides.qualityThreshold || GRADING_CONSTANTS.DEFAULT_QUALITY_THRESHOLD,
    shadowMode: overrides.shadowMode || false,
  };
}

/**
 * Validate grading configuration
 * Pure function - configuration validation
 */
export function validateGradingConfig(config: GradingConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check factor weights sum to approximately 1.0
  const totalWeight = Object.values(config.factorWeights).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    errors.push(`Factor weights sum to ${totalWeight.toFixed(3)}, should be 1.0`);
  }

  // Check individual weights are reasonable
  for (const [factorId, weight] of Object.entries(config.factorWeights)) {
    if (weight < 0 || weight > 1) {
      errors.push(`Factor weight for ${factorId} is ${weight}, should be between 0 and 1`);
    }
  }

  // Check tier thresholds are ordered
  const thresholds = config.tierThresholds;
  if (thresholds.S <= thresholds.A || thresholds.A <= thresholds.B || thresholds.B <= thresholds.C) {
    errors.push('Tier thresholds must be in descending order: S > A > B > C');
  }

  // Check quality threshold is reasonable
  if (config.qualityThreshold < 0 || config.qualityThreshold > 1) {
    errors.push(`Quality threshold ${config.qualityThreshold} should be between 0 and 1`);
  }

  // Check enabled factors have corresponding weights
  for (const factorId of config.enabledFactors) {
    if (!config.factorWeights[factorId]) {
      errors.push(`Enabled factor ${factorId} has no corresponding weight`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate edge score (score above neutral baseline)
 * Pure function - edge calculation
 */
export function calculateEdgeScore(totalScore: number): number {
  return Math.max(0, totalScore - GRADING_CONSTANTS.NEUTRAL_SCORE);
}

/**
 * Calculate risk score based on factors and confidence
 * Pure function - risk assessment
 */
export function calculateRiskScore(
  factors: FactorResult[],
  confidence: number
): number {
  // Base risk is inverse of confidence
  let riskScore = (1 - confidence) * 50;

  // Add risk for factor inconsistency
  const scoreVariance = calculateScoreVariance(factors);
  riskScore += scoreVariance / 10;

  // Add risk for missing data
  const dataCompleteness = factors.reduce((sum, factor) => {
    return sum + (factor.metadata?.dataAvailable ? 1 : 0);
  }, 0) / factors.length;
  
  riskScore += (1 - dataCompleteness) * 20;

  return Math.max(0, Math.min(100, riskScore));
}

// Helper functions (pure)

function calculateScoreVariance(factors: FactorResult[]): number {
  if (factors.length <= 1) return 0;
  
  const scores = factors.map(f => f.score);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  
  return variance;
}

function calculateVariance(values: number[]): number {
  if (values.length <= 1) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}