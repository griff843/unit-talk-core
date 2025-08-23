import {
  PromotionCandidate,
  EligibilityFactors,
  PromotionConfig,
  PromotionResult,
  PromotionError,
  PROMOTION_CONSTANTS,
} from './types.js';

/**
 * Calculate eligibility factors for a raw proposition
 * Pure function - no I/O operations
 */
export function calculateEligibilityFactors(
  rawData: Record<string, unknown>,
  insertedAt: Date,
  config: PromotionConfig,
  currentTime = new Date()
): EligibilityFactors {
  const ageHours = (currentTime.getTime() - insertedAt.getTime()) / (1000 * 60 * 60);
  
  // Time weight: fresher content scores higher
  const timeWeight = Math.max(0, 1 - (ageHours / config.maxAgeHours));
  
  // Quality score: based on data completeness and structure
  const qualityScore = assessDataQuality(rawData);
  
  // Uniqueness score: placeholder for deduplication logic
  const uniquenessScore = 1.0; // Will be calculated by selector
  
  // Source reliability: extracted from data source metadata
  const sourceReliability = extractSourceReliability(rawData);
  
  // Market relevance: basic assessment from data properties
  const marketRelevance = assessMarketRelevance(rawData);
  
  return {
    timeWeight,
    qualityScore,
    uniquenessScore,
    sourceReliability,
    marketRelevance,
  };
}

/**
 * Calculate composite score for promotion eligibility
 * Pure function - deterministic scoring
 */
export function calculatePromotionScore(
  factors: EligibilityFactors,
  weights = PROMOTION_CONSTANTS.DEFAULT_SCORING_WEIGHTS
): number {
  return (
    factors.timeWeight * weights.time +
    factors.qualityScore * weights.quality +
    factors.uniquenessScore * weights.uniqueness +
    factors.sourceReliability * weights.source +
    factors.marketRelevance * weights.market
  );
}

/**
 * Filter candidates by eligibility rules
 * Pure function - no side effects
 */
export function filterEligibleCandidates(
  candidates: PromotionCandidate[],
  config: PromotionConfig
): {
  eligible: PromotionCandidate[];
  rejected: Array<{ candidate: PromotionCandidate; reason: string }>;
} {
  const eligible: PromotionCandidate[] = [];
  const rejected: Array<{ candidate: PromotionCandidate; reason: string }> = [];
  
  for (const candidate of candidates) {
    // Check minimum quality threshold
    if (candidate.eligibilityFactors.qualityScore < config.minQualityThreshold) {
      rejected.push({
        candidate,
        reason: `Quality score ${candidate.eligibilityFactors.qualityScore.toFixed(3)} below threshold ${config.minQualityThreshold}`,
      });
      continue;
    }
    
    // Check age limit
    const ageHours = (Date.now() - candidate.insertedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > config.maxAgeHours) {
      rejected.push({
        candidate,
        reason: `Age ${ageHours.toFixed(1)} hours exceeds limit ${config.maxAgeHours}`,
      });
      continue;
    }
    
    // Check composite score
    if (candidate.score <= 0) {
      rejected.push({
        candidate,
        reason: `Composite score ${candidate.score} is non-positive`,
      });
      continue;
    }
    
    eligible.push(candidate);
  }
  
  return { eligible, rejected };
}

/**
 * Apply flood guard protection
 * Pure function - checks against current promotions
 */
export function applyFloodGuard(
  candidates: PromotionCandidate[],
  currentPromotionsInWindow: number,
  config: PromotionConfig
): {
  allowed: PromotionCandidate[];
  blocked: PromotionCandidate[];
  floodGuardTriggered: boolean;
} {
  const maxAllowed = config.maxPromotionsPerWindow - currentPromotionsInWindow;
  
  if (maxAllowed <= 0) {
    return {
      allowed: [],
      blocked: candidates,
      floodGuardTriggered: true,
    };
  }
  
  if (candidates.length <= maxAllowed) {
    return {
      allowed: candidates,
      blocked: [],
      floodGuardTriggered: false,
    };
  }
  
  // Take top candidates by score when flood guard limits apply
  const sortedByScore = [...candidates].sort((a, b) => b.score - a.score);
  
  return {
    allowed: sortedByScore.slice(0, maxAllowed),
    blocked: sortedByScore.slice(maxAllowed),
    floodGuardTriggered: true,
  };
}

/**
 * Validate promotion result for consistency
 * Pure function - data integrity check
 */
export function validatePromotionResult(result: PromotionResult): void {
  if (result.totalProcessed !== result.selectedCandidates.length + result.rejectedCandidates.length) {
    throw new PromotionError(
      'Promotion result inconsistent: total processed does not match selected + rejected',
      'RESULT_INCONSISTENT',
      {
        totalProcessed: result.totalProcessed,
        selected: result.selectedCandidates.length,
        rejected: result.rejectedCandidates.length,
      }
    );
  }
  
  // Check for duplicate selections
  const selectedIds = new Set(result.selectedCandidates.map(c => c.rawId));
  if (selectedIds.size !== result.selectedCandidates.length) {
    throw new PromotionError(
      'Promotion result contains duplicate selections',
      'DUPLICATE_SELECTIONS'
    );
  }
  
  // Validate flood guard logic
  if (result.selectedCandidates.length > result.metadata.configUsed.maxPromotionsPerWindow) {
    throw new PromotionError(
      'Promotion result exceeds flood guard limit',
      'FLOOD_GUARD_VIOLATION',
      {
        selected: result.selectedCandidates.length,
        limit: result.metadata.configUsed.maxPromotionsPerWindow,
      }
    );
  }
}

// Helper functions (pure, no I/O)

function assessDataQuality(data: Record<string, unknown>): number {
  let score = 0;
  const weights = { completeness: 0.4, structure: 0.3, validity: 0.3 };
  
  // Completeness: how many expected fields are present
  const expectedFields = ['source', 'type', 'content', 'timestamp'];
  const presentFields = expectedFields.filter(field => data[field] != null);
  score += (presentFields.length / expectedFields.length) * weights.completeness;
  
  // Structure: basic validation of data types
  let structureScore = 0;
  if (typeof data.source === 'string' && data.source.length > 0) structureScore += 0.25;
  if (typeof data.type === 'string' && data.type.length > 0) structureScore += 0.25;
  if (data.content != null) structureScore += 0.25;
  if (data.timestamp != null) structureScore += 0.25;
  score += structureScore * weights.structure;
  
  // Validity: check for obviously invalid data
  let validityScore = 1.0;
  if (typeof data.source === 'string' && data.source.trim().length === 0) validityScore -= 0.3;
  if (typeof data.content === 'string' && data.content.trim().length === 0) validityScore -= 0.3;
  score += Math.max(0, validityScore) * weights.validity;
  
  return Math.min(1.0, Math.max(0, score));
}

function extractSourceReliability(data: Record<string, unknown>): number {
  const source = data.source as string;
  
  // Simple source reliability mapping
  const reliabilityMap: Record<string, number> = {
    'official': 0.95,
    'verified': 0.85,
    'trusted': 0.75,
    'community': 0.65,
    'user': 0.55,
    'anonymous': 0.45,
  };
  
  if (!source || typeof source !== 'string') {
    return 0.5; // Default neutral reliability
  }
  
  const sourceKey = source.toLowerCase();
  return reliabilityMap[sourceKey] ?? 0.6;
}

function assessMarketRelevance(data: Record<string, unknown>): number {
  // Basic market relevance assessment
  let relevance = 0.5; // Default neutral
  
  // Check for market-relevant keywords in content
  const content = (data.content as string)?.toLowerCase() ?? '';
  const marketKeywords = ['market', 'price', 'trend', 'analysis', 'prediction', 'forecast'];
  
  const keywordMatches = marketKeywords.filter(keyword => content.includes(keyword)).length;
  relevance += (keywordMatches / marketKeywords.length) * 0.3;
  
  // Check for urgency indicators
  const urgencyKeywords = ['breaking', 'urgent', 'alert', 'immediate', 'now'];
  const urgencyMatches = urgencyKeywords.filter(keyword => content.includes(keyword)).length;
  relevance += (urgencyMatches / urgencyKeywords.length) * 0.2;
  
  return Math.min(1.0, Math.max(0, relevance));
}