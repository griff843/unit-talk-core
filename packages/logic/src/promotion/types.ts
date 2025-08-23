import { z } from 'zod';

/**
 * Raw proposition from ingestion
 */
export const RawPropsRowSchema = z.object({
  id: z.string().uuid(),
  inserted_at: z.string().datetime(),
  processed_at: z.string().datetime().nullable(),
  data: z.record(z.unknown()), // JSONB payload
});

export type RawPropsRow = z.infer<typeof RawPropsRowSchema>;

/**
 * Unified pick after promotion
 */
export const UnifiedPickRowSchema = z.object({
  id: z.string().uuid(),
  raw_id: z.string().uuid(),
  promoted_at: z.string().datetime().nullable(),
  data: z.record(z.unknown()), // JSONB payload
});

export type UnifiedPickRow = z.infer<typeof UnifiedPickRowSchema>;

/**
 * Candidate for promotion (internal)
 */
export interface PromotionCandidate {
  readonly rawId: string;
  readonly insertedAt: Date;
  readonly payload: Record<string, unknown>;
  readonly score: number;
  readonly eligibilityFactors: EligibilityFactors;
}

/**
 * Factors used in promotion eligibility scoring
 */
export interface EligibilityFactors {
  readonly timeWeight: number; // Age-based scoring
  readonly qualityScore: number; // Data quality assessment
  readonly uniquenessScore: number; // Deduplication factor
  readonly sourceReliability: number; // Source trust factor
  readonly marketRelevance: number; // Current market relevance
}

/**
 * Promotion configuration (injected parameters)
 */
export interface PromotionConfig {
  readonly maxPromotionsPerWindow: number; // Flood guard limit
  readonly windowSizeMinutes: number; // Time window for flood guard
  readonly minQualityThreshold: number; // Minimum quality score (0-1)
  readonly maxAgeHours: number; // Maximum age for candidates
  readonly dedupeLookbackHours: number; // How far back to check for duplicates
  readonly scoringWeights: {
    readonly time: number;
    readonly quality: number;
    readonly uniqueness: number;
    readonly source: number;
    readonly market: number;
  };
}

/**
 * Result of promotion selection process
 */
export interface PromotionResult {
  readonly selectedCandidates: PromotionCandidate[];
  readonly rejectedCandidates: Array<{
    candidate: PromotionCandidate;
    reason: string;
  }>;
  readonly floodGuardTriggered: boolean;
  readonly totalProcessed: number;
  readonly metadata: {
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly configUsed: PromotionConfig;
  };
}

/**
 * Promotion errors
 */
export class PromotionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PromotionError';
  }
}

// Constants for promotion logic
export const PROMOTION_CONSTANTS = {
  DEFAULT_MAX_PROMOTIONS_PER_5MIN: 20,
  DEFAULT_MIN_QUALITY_THRESHOLD: 0.6,
  DEFAULT_MAX_AGE_HOURS: 24,
  DEFAULT_DEDUPE_LOOKBACK_HOURS: 48,
  DEFAULT_SCORING_WEIGHTS: {
    time: 0.25 as number,
    quality: 0.30 as number,
    uniqueness: 0.20 as number,
    source: 0.15 as number,
    market: 0.10 as number,
  },
} as const;