/**
 * Pure feature calculation functions - no I/O operations
 */

import {
  GradingInput,
  FactorResult,
  GradingConfig,
  GRADING_CONSTANTS,
} from './types.js';

/**
 * Calculate basic player performance factor
 * Pure function - no external dependencies
 */
export function calculatePlayerPerformanceFactor(
  input: GradingInput,
  historicalData?: Record<string, unknown>
): FactorResult {
  let score: number = GRADING_CONSTANTS.NEUTRAL_SCORE;
  let confidence = 0.5;

  // Basic heuristics for player performance
  if (input.sport === 'MLB') {
    // Simple batting average or ERA-based scoring
    const playerStats = historicalData?.playerStats as Record<string, number> | undefined;
    if (playerStats) {
      if (input.marketType?.includes('hits') && playerStats.battingAverage) {
        score = Math.min(100, 30 + (playerStats.battingAverage * 70));
        confidence = 0.8;
      } else if (input.marketType?.includes('strikeouts') && playerStats.era) {
        score = Math.min(100, 70 - (playerStats.era * 10));
        confidence = 0.7;
      }
    }
  } else if (input.sport === 'NBA') {
    const playerStats = historicalData?.playerStats as Record<string, number> | undefined;
    if (playerStats && playerStats.ppg) {
      score = Math.min(100, 40 + (playerStats.ppg * 2));
      confidence = 0.75;
    }
  }

  return {
    factorId: 'player_performance',
    score,
    confidence,
    weight: 0.25,
    contribution: 0,
    metadata: {
      sport: input.sport,
      marketType: input.marketType,
      dataAvailable: !!historicalData?.playerStats,
    },
  };
}

/**
 * Calculate team context factor
 * Pure function - considers team strength and matchup
 */
export function calculateTeamContextFactor(
  _input: GradingInput,
  teamData?: Record<string, unknown>
): FactorResult {
  let score: number = GRADING_CONSTANTS.NEUTRAL_SCORE;
  let confidence = 0.4;

  const team = teamData?.team as Record<string, number> | undefined;
  const opponent = teamData?.opponent as Record<string, number> | undefined;

  if (team && opponent) {
    // Calculate strength differential
    const teamStrength = team.winRate || 0.5;
    const opponentStrength = opponent.winRate || 0.5;
    const differential = teamStrength - opponentStrength;

    // Convert differential to score (range -0.5 to 0.5 -> 25 to 75)
    score = 50 + (differential * 50);
    confidence = 0.7;

    // Home field advantage
    if (teamData?.isHome) {
      score += 5; // Small home field boost
    }
  }

  return {
    factorId: 'team_context',
    score: Math.max(0, Math.min(100, score)),
    confidence,
    weight: 0.2,
    contribution: 0,
    metadata: {
      teamStrength: team?.winRate,
      opponentStrength: opponent?.winRate,
      isHome: teamData?.isHome,
    },
  };
}

/**
 * Calculate market analysis factor
 * Pure function - analyzes odds and market conditions
 */
export function calculateMarketAnalysisFactor(
  input: GradingInput,
  marketData?: Record<string, unknown>
): FactorResult {
  let score: number = GRADING_CONSTANTS.NEUTRAL_SCORE;
  let confidence = 0.6;

  const odds = input.odds || marketData?.odds as number;
  if (odds) {
    // Convert odds to implied probability
    let impliedProb: number;
    if (odds > 0) {
      impliedProb = 100 / (odds + 100);
    } else {
      impliedProb = Math.abs(odds) / (Math.abs(odds) + 100);
    }

    // Look for value in odds
    const fairProbability = 0.5; // Placeholder - would use actual probability model
    const edge = fairProbability - impliedProb;
    
    // Convert edge to score
    score = 50 + (edge * 200); // Scale edge to score range
    
    // Higher confidence for more liquid markets
    const volume = marketData?.volume as number || 0;
    confidence = Math.min(0.9, 0.3 + (volume / 10000) * 0.6);
  }

  return {
    factorId: 'market_analysis',
    score: Math.max(0, Math.min(100, score)),
    confidence,
    weight: 0.3,
    contribution: 0,
    metadata: {
      odds,
      impliedProbability: odds ? (odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)) : null,
      marketVolume: marketData?.volume,
    },
  };
}

/**
 * Calculate historical trends factor
 * Pure function - analyzes past performance patterns
 */
export function calculateHistoricalTrendsFactor(
  _input: GradingInput,
  historicalTrends?: Record<string, unknown>
): FactorResult {
  let score: number = GRADING_CONSTANTS.NEUTRAL_SCORE;
  let confidence = 0.3;

  const trends = historicalTrends?.trends as Record<string, number> | undefined;
  if (trends) {
    // Look for consistent patterns
    const recentPerformance = trends.last10Games || 0.5;
    const seasonPerformance = trends.seasonAvg || 0.5;
    const matchupHistory = trends.vsOpponent || 0.5;

    // Weighted combination of trends
    score = 30 + (recentPerformance * 25) + (seasonPerformance * 25) + (matchupHistory * 20);
    confidence = 0.6;

    // Boost confidence for larger sample sizes
    const sampleSize = trends.gamesSample || 0;
    if (sampleSize > 20) confidence = Math.min(0.8, confidence + 0.2);
  }

  return {
    factorId: 'historical_trends',
    score: Math.max(0, Math.min(100, score)),
    confidence,
    weight: 0.15,
    contribution: 0,
    metadata: {
      recentForm: trends?.last10Games,
      seasonAverage: trends?.seasonAvg,
      matchupHistory: trends?.vsOpponent,
      sampleSize: trends?.gamesSample,
    },
  };
}

/**
 * Calculate situational factors
 * Pure function - considers game context and external factors
 */
export function calculateSituationalFactor(
  input: GradingInput,
  situationalData?: Record<string, unknown>
): FactorResult {
  let score: number = GRADING_CONSTANTS.NEUTRAL_SCORE;
  let confidence = 0.4;

  if (situationalData) {
    const weather = situationalData.weather as Record<string, unknown> | undefined;
    const injuries = situationalData.injuries as string[] | undefined;
    const rest = situationalData.daysRest as number | undefined;
    
    // Weather impact (primarily for outdoor sports)
    if (weather && ['MLB', 'NFL'].includes(input.sport)) {
      const windSpeed = weather.windSpeed as number || 0;
      const temperature = weather.temperature as number || 70;
      
      if (input.marketType?.includes('over') && windSpeed > 15) {
        score -= 10; // Wind reduces scoring
      }
      if (temperature < 40 && input.sport === 'NFL') {
        score -= 5; // Cold weather impacts
      }
    }

    // Injury impact
    if (injuries && injuries.length > 0) {
      score -= injuries.length * 5; // Each injury reduces score
      confidence += 0.1; // More confident with injury info
    }

    // Rest advantage
    if (rest !== undefined) {
      if (rest > 3) score += 5; // Well rested
      if (rest === 0) score -= 10; // Back-to-back fatigue
      confidence += 0.15;
    }
  }

  return {
    factorId: 'situational_factors',
    score: Math.max(0, Math.min(100, score)),
    confidence: Math.min(1, confidence),
    weight: 0.1,
    contribution: 0,
    metadata: {
      weatherConsidered: !!situationalData?.weather,
      injuriesCount: (situationalData?.injuries as string[])?.length || 0,
      daysRest: situationalData?.daysRest,
    },
  };
}

/**
 * Calculate all factor results for a grading input
 * Pure function - orchestrates all factor calculations
 */
export function calculateAllFactors(
  input: GradingInput,
  config: GradingConfig,
  contextData?: Record<string, unknown>
): FactorResult[] {
  const factors: FactorResult[] = [];

  // Calculate each factor if enabled in config
  if (config.enabledFactors.includes('player_performance')) {
    factors.push(calculatePlayerPerformanceFactor(input, contextData?.historical as Record<string, unknown>));
  }

  if (config.enabledFactors.includes('team_context')) {
    factors.push(calculateTeamContextFactor(input, contextData?.team as Record<string, unknown>));
  }

  if (config.enabledFactors.includes('market_analysis')) {
    factors.push(calculateMarketAnalysisFactor(input, contextData?.market as Record<string, unknown>));
  }

  if (config.enabledFactors.includes('historical_trends')) {
    factors.push(calculateHistoricalTrendsFactor(input, contextData?.trends as Record<string, unknown>));
  }

  if (config.enabledFactors.includes('situational_factors')) {
    factors.push(calculateSituationalFactor(input, contextData?.situational as Record<string, unknown>));
  }

  // Apply weights and calculate contributions
  return factors.map(factor => ({
    ...factor,
    weight: config.factorWeights[factor.factorId] || factor.weight,
    contribution: factor.score * (config.factorWeights[factor.factorId] || factor.weight),
  }));
}

/**
 * Validate factor results for consistency
 * Pure function - ensures data integrity
 */
export function validateFactorResults(factors: FactorResult[]): boolean {
  for (const factor of factors) {
    if (factor.score < 0 || factor.score > 100) return false;
    if (factor.confidence < 0 || factor.confidence > 1) return false;
    if (factor.weight < 0 || factor.weight > 1) return false;
  }
  return true;
}