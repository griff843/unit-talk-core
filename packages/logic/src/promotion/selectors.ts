import {
  calculateEligibilityFactors,
  calculatePromotionScore,
  filterEligibleCandidates,
  applyFloodGuard,
  validatePromotionResult,
} from './rules.js';
import type {
  PromotionCandidate,
  PromotionConfig,
  PromotionResult,
  RawPropsRow,
} from './types.js';
import { PROMOTION_CONSTANTS } from './types.js';

/**
 * Main promotion selection algorithm
 * Pure function - takes data and returns selections without I/O
 */
export function selectCandidatesForPromotion(
  rawProps: RawPropsRow[],
  existingPromotions: string[], // raw_ids already promoted in window
  config: PromotionConfig,
  currentTime = new Date()
): PromotionResult {
  const windowStart = new Date(
    currentTime.getTime() - config.windowSizeMinutes * 60 * 1000
  );

  // Step 1: Convert raw props to candidates with scoring
  const candidates: PromotionCandidate[] = rawProps
    .filter(raw => raw.processed_at != null) // Only process processed items
    .filter(raw => !existingPromotions.includes(raw.id)) // Exclude already promoted
    .map(raw => {
      const insertedAt = new Date(raw.inserted_at);
      const eligibilityFactors = calculateEligibilityFactors(
        raw.data,
        insertedAt,
        config,
        currentTime
      );

      // Calculate uniqueness score based on similar existing candidates
      const uniquenessScore = calculateUniquenessScore(raw, rawProps);
      const updatedFactors = { ...eligibilityFactors, uniquenessScore };

      const score = calculatePromotionScore(
        updatedFactors,
        config.scoringWeights
      );

      return {
        rawId: raw.id,
        insertedAt,
        payload: raw.data,
        score,
        eligibilityFactors: updatedFactors,
      };
    });

  // Step 2: Filter by eligibility rules
  const { eligible, rejected } = filterEligibleCandidates(candidates, config);

  // Step 3: Sort by score (descending)
  const sortedCandidates = [...eligible].sort((a, b) => b.score - a.score);

  // Step 4: Apply flood guard protection
  const { allowed, blocked, floodGuardTriggered } = applyFloodGuard(
    sortedCandidates,
    existingPromotions.length,
    config
  );

  // Add blocked candidates to rejected list
  const allRejected = [
    ...rejected,
    ...blocked.map(candidate => ({
      candidate,
      reason: 'Blocked by flood guard protection',
    })),
  ];

  // Step 5: Build result
  const result: PromotionResult = {
    selectedCandidates: allowed,
    rejectedCandidates: allRejected,
    floodGuardTriggered,
    totalProcessed: candidates.length,
    metadata: {
      windowStart,
      windowEnd: currentTime,
      configUsed: config,
    },
  };

  // Step 6: Validate result consistency
  validatePromotionResult(result);

  return result;
}

/**
 * Create default promotion configuration
 * Pure function - no environment dependencies
 */
export function createDefaultPromotionConfig(
  overrides: Partial<PromotionConfig> = {}
): PromotionConfig {
  return {
    maxPromotionsPerWindow:
      overrides.maxPromotionsPerWindow ??
      PROMOTION_CONSTANTS.DEFAULT_MAX_PROMOTIONS_PER_5MIN,
    windowSizeMinutes: overrides.windowSizeMinutes ?? 5,
    minQualityThreshold:
      overrides.minQualityThreshold ??
      PROMOTION_CONSTANTS.DEFAULT_MIN_QUALITY_THRESHOLD,
    maxAgeHours:
      overrides.maxAgeHours ?? PROMOTION_CONSTANTS.DEFAULT_MAX_AGE_HOURS,
    dedupeLookbackHours:
      overrides.dedupeLookbackHours ??
      PROMOTION_CONSTANTS.DEFAULT_DEDUPE_LOOKBACK_HOURS,
    scoringWeights: {
      ...PROMOTION_CONSTANTS.DEFAULT_SCORING_WEIGHTS,
      ...overrides.scoringWeights,
    },
  };
}

/**
 * Check if a candidate should be considered duplicate of existing content
 * Pure function - content-based deduplication
 */
export function calculateUniquenessScore(
  candidate: RawPropsRow,
  allCandidates: RawPropsRow[]
): number {
  const candidateContent = extractContentSignature(candidate.data);

  if (!candidateContent) {
    return 0.5; // Neutral score for content without clear signature
  }

  // Count similar content in the dataset
  const similarCount = allCandidates
    .filter(other => other.id !== candidate.id)
    .map(other => extractContentSignature(other.data))
    .filter(
      signature =>
        signature && calculateSimilarity(candidateContent, signature) > 0.7
    ).length;

  // Higher uniqueness for less similar content
  return Math.max(0.1, 1.0 - similarCount * 0.2);
}

/**
 * Extract content signature for deduplication
 * Pure function - content analysis
 */
function extractContentSignature(data: Record<string, unknown>): string | null {
  // Try multiple fields that might contain the main content
  const contentFields = ['content', 'title', 'summary', 'description', 'text'];

  for (const field of contentFields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      // Normalize content for comparison
      return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ') // Keep only alphanumeric and spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }
  }

  return null;
}

/**
 * Calculate similarity between two content signatures
 * Pure function - string similarity
 */
function calculateSimilarity(content1: string, content2: string): number {
  if (content1 === content2) return 1.0;

  // Simple word-based similarity using Jaccard index
  const words1 = new Set(content1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(content2.split(' ').filter(w => w.length > 2));

  if (words1.size === 0 && words2.size === 0) return 1.0;
  if (words1.size === 0 || words2.size === 0) return 0.0;

  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Get promotion candidates that are ready for processing
 * Pure function - data filtering
 */
export function getReadyCandidates(
  rawProps: RawPropsRow[],
  maxAgeHours: number,
  currentTime = new Date()
): RawPropsRow[] {
  const cutoffTime = new Date(
    currentTime.getTime() - maxAgeHours * 60 * 60 * 1000
  );

  return rawProps.filter(raw => {
    // Must be processed
    if (!raw.processed_at) return false;

    // Must be within age limit
    const insertedAt = new Date(raw.inserted_at);
    if (insertedAt < cutoffTime) return false;

    return true;
  });
}

/**
 * Ensure promotion operation is idempotent
 * Pure function - duplicate detection
 */
export function ensureIdempotency(
  candidates: PromotionCandidate[],
  existingPromotions: Array<{ raw_id: string; promoted_at: string }>
): PromotionCandidate[] {
  const promotedRawIds = new Set(existingPromotions.map(p => p.raw_id));

  return candidates.filter(candidate => !promotedRawIds.has(candidate.rawId));
}
