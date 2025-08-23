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

  constructor(
    message: string,
    code: string,
    pickId?: string,
    factorId?: string
  ) {
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
    CORE_FUNDAMENTALS: 'core_fundamentals',
    MARKET_INTELLIGENCE: 'market_intelligence',
    PERFORMANCE: 'performance',
    PLAYER_CONTEXT: 'player_context',
    GAME_ENVIRONMENT: 'game_environment',
    RISK_ASSESSMENT: 'risk_assessment',
    ML_MODELS: 'ml_models',
    PROFESSIONAL_CAPPER: 'professional_capper',
  },
  FACTOR_WEIGHTS: {
    // Core fundamentals (12 factors) - 40% total weight
    expected_value: 0.15,
    line_movement: 0.12,
    player_form: 0.2,
    closing_line_value: 0.18,
    matchup_rating: 0.1,
    injury_impact: 0.15,
    weather_impact: 0.05,
    market_efficiency: 0.08,
    volume_profile: 0.06,
    bid_ask_spread: 0.04,
    model_confidence: 0.07,
    data_quality: 0.03,

    // Market intelligence (10 factors) - 25% total weight
    sharp_money: 0.14,
    steam_detection: 0.12,
    public_vs_sharp: 0.1,
    line_shopping_edge: 0.08,
    closing_line_prediction: 0.09,
    market_timing: 0.08,
    cross_market_arb: 0.06,
    market_maker_action: 0.07,
    liquidity_analysis: 0.05,
    news_sentiment_impact: 0.06,

    // Performance factors (15 factors) - 20% total weight
    playerForm3Games: 0.12,
    playerForm7Games: 0.1,
    seasonPerformanceTrend: 0.1,
    careerVsOpponent: 0.09,
    clutchPerformance: 0.08,
    consistencyRating: 0.07,
    injuryRecoveryStatus: 0.15,
    usageRateTrends: 0.1,
    restAdvantage: 0.08,
    homeAwaySplits: 0.06,
    player_fatigue: 0.05,
    situational_performance: 0.06,
    opponent_strength: 0.04,
    player_motivation: 0.03,
    role_usage_rate: 0.07,

    // Game environment (6 factors) - 5% total weight
    venue_advantage: 0.25,
    pace_impact: 0.2,
    referee_impact: 0.15,
    game_importance: 0.2,
    crowd_factor: 0.1,
    broadcast_spotlight: 0.1,

    // Risk assessment (5 factors) - 5% total weight
    correlation_risk: 0.25,
    volatility_risk: 0.3,
    liquidity_risk: 0.2,
    model_uncertainty: 0.15,
    external_risk: 0.1,

    // Professional capper (8 factors) - 5% total weight
    injury_timing_edge: 0.15,
    optimal_timing: 0.18,
    contrarian_opportunity: 0.12,
    line_value_projection: 0.1,
    sharp_consensus: 0.14,
    reverse_line_movement: 0.16,
    bet_type_edge: 0.08,
    syndicate_action: 0.07,
  },
} as const;
