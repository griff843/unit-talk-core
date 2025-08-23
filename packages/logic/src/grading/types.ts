/**
 * Pure grading types - no I/O dependencies
 */

export interface GradingInput {
  pickId: string;
  tenantId: string;
  sport: string;
  league?: string;
  player?: string;
  gameId?: string;
  team?: string;
  opponent?: string;
  marketType: string;
  odds?: number;
  line?: number;
  eventId?: string;
  selection?: string;
  data?: Record<string, unknown>;
}

export interface GradingResult {
  pickId: string;
  totalScore: number;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
  confidenceLevel: number;
  factorBreakdown: Record<string, number>;
  gradingMetadata: {
    version: string;
    processedAt: Date;
    factorsApplied: string[];
    qualityScore: number;
  };
  edgeScore?: number;
  riskScore?: number;
}

export interface FactorResult {
  factorId: string;
  score: number;
  confidence: number;
  weight: number;
  contribution: number;
  metadata?: Record<string, unknown>;
}

export interface GradingConfig {
  version: string;
  enabledFactors: string[];
  factorWeights: Record<string, number>;
  tierThresholds: {
    S: number;
    A: number;
    B: number;
    C: number;
  };
  qualityThreshold: number;
  shadowMode?: boolean;
}

export interface MarketOutcome {
  result: 'win' | 'loss' | 'push' | 'void' | 'pending';
  settledAt?: Date;
  actualValue?: number;
  officialSource?: string;
}

export class GradingError extends Error {
  public readonly code: string;
  public readonly pickId?: string;
  public readonly factorId?: string;

  constructor(message: string, code: string, pickId?: string, factorId?: string) {
    super(message);
    this.name = 'GradingError';
    this.code = code;
    this.pickId = pickId;
    this.factorId = factorId;
    Object.setPrototypeOf(this, GradingError.prototype);
  }
}

// Constants for grading system
export const GRADING_CONSTANTS = {
  DEFAULT_VERSION: 'v2.0.0',
  MAX_SCORE: 100,
  MIN_SCORE: 0,
  NEUTRAL_SCORE: 50,
  MIN_CONFIDENCE: 0.0,
  MAX_CONFIDENCE: 1.0,
  DEFAULT_QUALITY_THRESHOLD: 0.7,
  TIER_THRESHOLDS: {
    S: 85,
    A: 70,
    B: 55,
    C: 40,
  },
  SUPPORTED_SPORTS: ['MLB', 'NFL', 'NBA', 'NHL', 'NCAAB', 'NCAAF'],
  FACTOR_CATEGORIES: {
    PLAYER_PERFORMANCE: 'player_performance',
    TEAM_CONTEXT: 'team_context',
    MARKET_ANALYSIS: 'market_analysis',
    HISTORICAL_TRENDS: 'historical_trends',
    SITUATIONAL_FACTORS: 'situational_factors',
  },
} as const;