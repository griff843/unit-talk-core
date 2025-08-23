/**
 * Pure statistical utility functions for grading calculations
 * No I/O operations, fully deterministic and testable
 */

/**
 * Mathematical operations for factor calculations
 */
export class StatisticalUtils {
  /**
   * Calculate expected value transformation (0-15% EV -> 0-100 score)
   */
  static calculateExpectedValueScore(ev: number): number {
    // Scale EV to 0-100: 15% EV = 100 points
    return Math.min(100, Math.max(0, (ev / 15) * 100));
  }

  /**
   * Calculate line movement score
   */
  static calculateLineMovementScore(movement: number): number {
    // Favorable movement (steam) increases score
    return Math.min(100, 50 + movement * 10);
  }

  /**
   * Calculate weighted form score
   */
  static calculateWeightedFormScore(
    form3Games: number,
    form7Games: number
  ): number {
    // Weight recent form higher (70% 3-game, 30% 7-game)
    const weightedForm = form3Games * 0.7 + form7Games * 0.3;
    return Math.min(100, Math.max(0, weightedForm));
  }

  /**
   * Calculate injury impact score
   */
  static calculateInjuryImpactScore(
    _injuryImpact: number,
    daysSinceInjury: number,
    severity: 'minor' | 'moderate' | 'major' | 'out',
    isReturned: boolean = false
  ): number {
    let injuryScore = 100; // Start with no impact

    switch (severity) {
      case 'minor':
        injuryScore = Math.max(70, 95 - daysSinceInjury * 0.5);
        break;
      case 'moderate':
        injuryScore = Math.max(40, 80 - daysSinceInjury * 1);
        break;
      case 'major':
        injuryScore = Math.max(10, 60 - daysSinceInjury * 2);
        break;
      case 'out':
        injuryScore = 5; // Very low score for ruled out players
        break;
    }

    // Boost if past expected return date
    if (isReturned) {
      injuryScore += 15;
    }

    return Math.min(100, Math.max(0, injuryScore));
  }

  /**
   * Calculate weather impact score
   */
  static calculateWeatherImpactScore(weatherImpact: number): number {
    return Math.max(0, 100 - Math.abs(weatherImpact) * 10);
  }

  /**
   * Calculate closing line value score
   */
  static calculateClosingLineValueScore(clv: number): number {
    return Math.min(100, 50 + clv * 5);
  }

  /**
   * Calculate market efficiency score
   */
  static calculateMarketEfficiencyScore(liquidity: number): number {
    // Less efficient markets provide more opportunity
    return Math.max(0, (1 - liquidity) * 100);
  }

  /**
   * Calculate bid-ask spread score
   */
  static calculateBidAskSpreadScore(spread: number): number {
    // Lower spread = higher score (better liquidity)
    return Math.max(0, 100 - spread * 2000);
  }

  /**
   * Calculate steam detection score
   */
  static calculateSteamDetectionScore(
    lineMovement: number,
    volumeSpike: number
  ): number {
    const absMovement = Math.abs(lineMovement);
    if (absMovement > 1.5 && volumeSpike > 1.5) {
      return 90; // Strong steam detected
    } else if (absMovement > 1.0) {
      return 70; // Moderate steam
    }
    return 30; // No steam
  }

  /**
   * Calculate contrarian opportunity score
   */
  static calculateContrarianScore(publicPct: number): number {
    // Contrarian value when public heavily on one side
    if (publicPct > 75 || publicPct < 25) {
      return 80;
    }
    return 50;
  }

  /**
   * Calculate rest advantage score
   */
  static calculateRestAdvantageScore(
    daysRest: number,
    isBackToBack: boolean,
    travelDistance?: number,
    timeZoneChange?: number
  ): number {
    let restScore = 50;

    if (isBackToBack) {
      restScore = 25; // Significant disadvantage
    } else if (daysRest === 0) {
      restScore = 30; // Same day (rare but possible)
    } else if (daysRest === 1) {
      restScore = 85; // Optimal rest
    } else if (daysRest === 2) {
      restScore = 90; // Ideal rest
    } else if (daysRest === 3) {
      restScore = 85; // Good rest
    } else if (daysRest >= 4 && daysRest <= 7) {
      restScore = 70; // Some rust potential
    } else if (daysRest > 7) {
      restScore = 60; // Extended break, potential rust
    }

    // Travel factor
    if (travelDistance && travelDistance > 1000) {
      restScore -= 5; // Long travel impacts rest quality
    }

    // Time zone changes
    if (timeZoneChange && Math.abs(timeZoneChange) >= 2) {
      restScore -= Math.abs(timeZoneChange) * 2;
    }

    return Math.min(100, Math.max(0, restScore));
  }

  /**
   * Calculate venue advantage score
   */
  static calculateVenueAdvantageScore(
    venue: 'home' | 'away',
    sport: string,
    venueAdvantage?: number,
    crowdFactor?: number,
    isRivalry?: boolean
  ): number {
    let venueScore = 50;

    // Basic venue advantage
    if (venue === 'home') {
      venueScore = 65; // Base home advantage
    } else if (venue === 'away') {
      venueScore = 45; // Base away disadvantage
    }

    // Apply venue advantage multiplier
    if (venueAdvantage) {
      venueScore += venueAdvantage * 15;
    }

    // Sport-specific home field advantages
    switch (sport?.toUpperCase()) {
      case 'NBA':
        if (venue === 'home') venueScore += 8;
        break;
      case 'NFL':
        if (venue === 'home') venueScore += 12;
        break;
      case 'MLB':
        if (venue === 'home') venueScore += 6;
        break;
      case 'NHL':
        if (venue === 'home') venueScore += 10;
        break;
    }

    // Crowd factor
    if (crowdFactor) {
      venueScore += crowdFactor * 5;
    }

    // Rivalry games amplify home field advantage
    if (isRivalry && venue === 'home') {
      venueScore += 5;
    }

    return Math.min(100, Math.max(0, venueScore));
  }

  /**
   * Calculate optimal timing score
   */
  static calculateOptimalTimingScore(
    hoursToGame: number,
    hasBreakingNews?: boolean
  ): number {
    if (hoursToGame > 24) return 90; // Early value
    if (hoursToGame < 4) {
      return hasBreakingNews ? 80 : 30; // Late but with breaking news
    }
    if (hoursToGame > 8) return 70; // Good timing
    return 50;
  }

  /**
   * Calculate correlation risk score
   */
  static calculateCorrelationRiskScore(correlation: number): number {
    // Lower correlation = lower risk = higher score
    return Math.max(0, 100 - correlation * 100);
  }

  /**
   * Calculate volatility risk score
   */
  static calculateVolatilityRiskScore(volatility: number): number {
    // Lower volatility = higher score
    return Math.max(0, 100 - volatility * 10);
  }

  /**
   * Calculate usage rate score
   */
  static calculateUsageRateScore(usageRate: number): number {
    // Higher usage rate = more opportunities
    return Math.min(100, usageRate * 4);
  }

  /**
   * Calculate fatigue score
   */
  static calculateFatigueScore(fatigue: number): number {
    // Lower fatigue = higher score
    return Math.max(0, 100 - fatigue * 10);
  }

  /**
   * Calculate momentum score from performance trend
   */
  static calculateMomentumScore(recentGames: number[]): number {
    if (recentGames.length < 3) return 50;

    // Calculate linear regression slope
    const n = recentGames.length;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const y = recentGames;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Convert slope to 0-100 score
    return Math.min(100, Math.max(0, 50 + slope * 25));
  }

  /**
   * Calculate bet type edge score
   */
  static calculateBetTypeEdgeScore(marketType: string): number {
    const efficiencyMap: Record<string, number> = {
      player_props: 75,
      totals: 60,
      spreads: 45,
      moneyline: 40,
    };
    return efficiencyMap[marketType] || 50;
  }

  /**
   * Calculate syndicate action score
   */
  static calculateSyndicateActionScore(
    sharpMoney: number,
    volume: number
  ): number {
    // Large sharp money + high volume suggests syndicate action
    if (sharpMoney > 80 && volume > 2) {
      return 85;
    } else if (sharpMoney > 70) {
      return 65;
    }
    return 45;
  }

  /**
   * Calculate reverse line movement score
   */
  static calculateReverseLineMovementScore(
    publicPct: number,
    lineMovement: number
  ): number {
    // Reverse line movement: line moves opposite to public money
    const isReverse =
      (publicPct > 60 && lineMovement < 0) ||
      (publicPct < 40 && lineMovement > 0);
    return isReverse ? 80 : 40;
  }

  /**
   * Calculate composite score from weighted factors
   */
  static calculateCompositeScore(
    factorScores: Array<{ score: number; weight: number }>
  ): number {
    const totalWeight = factorScores.reduce((sum, f) => sum + f.weight, 0);
    if (totalWeight === 0) return 50;

    const weightedSum = factorScores.reduce(
      (sum, f) => sum + f.score * f.weight,
      0
    );
    return Math.min(100, Math.max(0, weightedSum / totalWeight));
  }

  /**
   * Calculate standard deviation
   */
  static calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate percentile rank
   */
  static calculatePercentileRank(value: number, dataset: number[]): number {
    if (dataset.length === 0) return 50;

    const sorted = [...dataset].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= value);

    if (index === -1) return 100; // Value is higher than all dataset values

    return (index / sorted.length) * 100;
  }

  /**
   * Calculate confidence interval
   */
  static calculateConfidenceInterval(
    mean: number,
    standardDeviation: number,
    sampleSize: number,
    confidenceLevel: number = 0.95
  ): { lower: number; upper: number } {
    // Z-score for confidence level (approximation)
    const zScore =
      confidenceLevel === 0.95
        ? 1.96
        : confidenceLevel === 0.99
          ? 2.576
          : 1.645; // 90%

    const marginOfError = zScore * (standardDeviation / Math.sqrt(sampleSize));

    return {
      lower: mean - marginOfError,
      upper: mean + marginOfError,
    };
  }

  /**
   * Calculate Kelly Criterion betting fraction
   */
  static calculateKellyCriterion(probability: number, odds: number): number {
    // Kelly formula: (bp - q) / b
    // b = odds received on wager
    // p = probability of winning
    // q = probability of losing (1 - p)

    const b = Math.abs(odds) / 100; // Convert American odds to decimal
    const p = probability;
    const q = 1 - p;

    const kellyFraction = (b * p - q) / b;

    // Cap at reasonable limits
    return Math.max(0, Math.min(0.25, kellyFraction));
  }

  /**
   * Calculate Sharpe ratio for risk-adjusted returns
   */
  static calculateSharpeRatio(
    returns: number[],
    riskFreeRate: number = 0.02
  ): number {
    if (returns.length === 0) return 0;

    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const excessReturn = meanReturn - riskFreeRate;
    const returnStdDev = this.calculateStandardDeviation(returns);

    return returnStdDev === 0 ? 0 : excessReturn / returnStdDev;
  }
}

/**
 * Specialized calculators for different sports
 */
export class SportSpecificUtils {
  /**
   * NBA-specific calculations
   */
  static calculateNBAScore(stat: string, value: number, _context: any): number {
    const baselineMap: Record<string, number> = {
      points: 15,
      rebounds: 8,
      assists: 5,
      steals: 1.5,
      blocks: 1,
      threes: 2,
    };

    const baseline = baselineMap[stat] || 10;
    return Math.min(100, (value / baseline) * 50);
  }

  /**
   * NFL-specific calculations
   */
  static calculateNFLScore(stat: string, value: number, _context: any): number {
    const baselineMap: Record<string, number> = {
      passing_yards: 250,
      rushing_yards: 80,
      receiving_yards: 60,
      touchdowns: 1,
      receptions: 5,
    };

    const baseline = baselineMap[stat] || 50;
    return Math.min(100, (value / baseline) * 50);
  }

  /**
   * MLB-specific calculations
   */
  static calculateMLBScore(stat: string, value: number, _context: any): number {
    const baselineMap: Record<string, number> = {
      hits: 2,
      runs: 1,
      rbis: 1,
      home_runs: 0.5,
      strikeouts: 6, // For pitchers
      walks: 3, // For pitchers
    };

    const baseline = baselineMap[stat] || 1;
    return Math.min(100, (value / baseline) * 50);
  }

  /**
   * NHL-specific calculations
   */
  static calculateNHLScore(stat: string, value: number, _context: any): number {
    const baselineMap: Record<string, number> = {
      goals: 0.5,
      assists: 0.7,
      points: 1,
      shots: 3,
      saves: 25, // For goalies
    };

    const baseline = baselineMap[stat] || 1;
    return Math.min(100, (value / baseline) * 50);
  }
}
