/**
 * Unit tests for Statistical Utilities
 * Pure logic tests with no I/O operations
 */

import { StatisticalUtils, SportSpecificUtils } from '../statistical-utils';

describe('StatisticalUtils', () => {
  describe('calculateExpectedValueScore', () => {
    it('should scale EV correctly to 0-100', () => {
      expect(StatisticalUtils.calculateExpectedValueScore(0)).toBe(0);
      expect(StatisticalUtils.calculateExpectedValueScore(15)).toBe(100);
      expect(StatisticalUtils.calculateExpectedValueScore(7.5)).toBe(50);
      expect(StatisticalUtils.calculateExpectedValueScore(30)).toBe(100); // Capped at 100
      expect(StatisticalUtils.calculateExpectedValueScore(-5)).toBe(0); // Floored at 0
    });
  });

  describe('calculateLineMovementScore', () => {
    it('should calculate line movement score correctly', () => {
      expect(StatisticalUtils.calculateLineMovementScore(0)).toBe(50);
      expect(StatisticalUtils.calculateLineMovementScore(1)).toBe(60);
      expect(StatisticalUtils.calculateLineMovementScore(-1)).toBe(40);
      expect(StatisticalUtils.calculateLineMovementScore(5)).toBe(100); // Capped at 100
    });
  });

  describe('calculateWeightedFormScore', () => {
    it('should weight recent form correctly', () => {
      expect(StatisticalUtils.calculateWeightedFormScore(70, 60)).toBe(67);
      expect(StatisticalUtils.calculateWeightedFormScore(100, 0)).toBe(70);
      expect(StatisticalUtils.calculateWeightedFormScore(0, 100)).toBe(30);
    });
  });

  describe('calculateInjuryImpactScore', () => {
    it('should calculate injury impact for different severities', () => {
      // Minor injury, recent
      expect(StatisticalUtils.calculateInjuryImpactScore(0, 1, 'minor')).toBe(94.5);
      
      // Major injury, old
      expect(StatisticalUtils.calculateInjuryImpactScore(0, 10, 'major')).toBe(40);
      
      // Player ruled out
      expect(StatisticalUtils.calculateInjuryImpactScore(0, 0, 'out')).toBe(5);
      
      // Player returned from injury
      expect(StatisticalUtils.calculateInjuryImpactScore(0, 5, 'moderate', true)).toBe(92.5);
    });

    it('should respect min/max bounds', () => {
      const score = StatisticalUtils.calculateInjuryImpactScore(0, 100, 'major');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateSteamDetectionScore', () => {
    it('should detect steam moves correctly', () => {
      expect(StatisticalUtils.calculateSteamDetectionScore(2, 2)).toBe(90); // Strong steam
      expect(StatisticalUtils.calculateSteamDetectionScore(1.2, 1)).toBe(70); // Moderate steam
      expect(StatisticalUtils.calculateSteamDetectionScore(0.5, 0.5)).toBe(30); // No steam
    });
  });

  describe('calculateRestAdvantageScore', () => {
    it('should calculate optimal rest scores', () => {
      expect(StatisticalUtils.calculateRestAdvantageScore(1, false)).toBe(85); // Optimal
      expect(StatisticalUtils.calculateRestAdvantageScore(2, false)).toBe(90); // Ideal
      expect(StatisticalUtils.calculateRestAdvantageScore(0, true)).toBe(25); // Back-to-back
      expect(StatisticalUtils.calculateRestAdvantageScore(10, false)).toBe(60); // Too much rest
    });

    it('should factor in travel and time zones', () => {
      const withTravel = StatisticalUtils.calculateRestAdvantageScore(1, false, 1200, 3);
      const withoutTravel = StatisticalUtils.calculateRestAdvantageScore(1, false);
      expect(withTravel).toBeLessThan(withoutTravel);
    });
  });

  describe('calculateVenueAdvantageScore', () => {
    it('should calculate home field advantage', () => {
      expect(StatisticalUtils.calculateVenueAdvantageScore('home', 'NBA')).toBe(73);
      expect(StatisticalUtils.calculateVenueAdvantageScore('away', 'NBA')).toBe(45);
      expect(StatisticalUtils.calculateVenueAdvantageScore('home', 'NFL')).toBe(77);
    });

    it('should factor in crowd and rivalry', () => {
      const withRivalry = StatisticalUtils.calculateVenueAdvantageScore('home', 'NBA', 0, 2, true);
      const withoutRivalry = StatisticalUtils.calculateVenueAdvantageScore('home', 'NBA', 0, 2, false);
      expect(withRivalry).toBe(withoutRivalry + 5);
    });
  });

  describe('calculateMomentumScore', () => {
    it('should calculate momentum from performance trend', () => {
      // Positive trend
      const upward = StatisticalUtils.calculateMomentumScore([40, 50, 60, 70, 80]);
      expect(upward).toBeGreaterThan(50);
      
      // Negative trend
      const downward = StatisticalUtils.calculateMomentumScore([80, 70, 60, 50, 40]);
      expect(downward).toBeLessThan(50);
      
      // Flat trend
      const flat = StatisticalUtils.calculateMomentumScore([50, 50, 50, 50, 50]);
      expect(flat).toBe(50);
    });

    it('should handle edge cases', () => {
      expect(StatisticalUtils.calculateMomentumScore([])).toBe(50);
      expect(StatisticalUtils.calculateMomentumScore([75])).toBe(50);
      expect(StatisticalUtils.calculateMomentumScore([75, 80])).toBeGreaterThan(50);
    });
  });

  describe('calculateCompositeScore', () => {
    it('should weight factors correctly', () => {
      const factors = [
        { score: 80, weight: 0.5 },
        { score: 60, weight: 0.3 },
        { score: 40, weight: 0.2 }
      ];
      const expected = (80 * 0.5 + 60 * 0.3 + 40 * 0.2) / (0.5 + 0.3 + 0.2);
      expect(StatisticalUtils.calculateCompositeScore(factors)).toBe(expected);
    });

    it('should handle edge cases', () => {
      expect(StatisticalUtils.calculateCompositeScore([])).toBe(50);
      expect(StatisticalUtils.calculateCompositeScore([{ score: 200, weight: 1 }])).toBe(100);
      expect(StatisticalUtils.calculateCompositeScore([{ score: -50, weight: 1 }])).toBe(0);
    });
  });

  describe('calculateStandardDeviation', () => {
    it('should calculate standard deviation correctly', () => {
      expect(StatisticalUtils.calculateStandardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(1.58, 2);
      expect(StatisticalUtils.calculateStandardDeviation([10, 10, 10, 10])).toBe(0);
      expect(StatisticalUtils.calculateStandardDeviation([])).toBe(0);
    });
  });

  describe('calculatePercentileRank', () => {
    it('should calculate percentile rank correctly', () => {
      const dataset = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(StatisticalUtils.calculatePercentileRank(5, dataset)).toBe(40);
      expect(StatisticalUtils.calculatePercentileRank(1, dataset)).toBe(0);
      expect(StatisticalUtils.calculatePercentileRank(15, dataset)).toBe(100);
    });
  });

  describe('calculateKellyCriterion', () => {
    it('should calculate Kelly fraction correctly', () => {
      // 60% probability at +150 odds
      const kelly = StatisticalUtils.calculateKellyCriterion(0.6, 150);
      expect(kelly).toBeGreaterThan(0);
      expect(kelly).toBeLessThanOrEqual(0.25); // Capped at 25%
    });

    it('should return 0 for negative expected value', () => {
      const kelly = StatisticalUtils.calculateKellyCriterion(0.3, 150);
      expect(kelly).toBe(0);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('should calculate Sharpe ratio correctly', () => {
      const returns = [0.1, 0.05, -0.02, 0.08, 0.12];
      const sharpe = StatisticalUtils.calculateSharpeRatio(returns, 0.02);
      expect(typeof sharpe).toBe('number');
    });

    it('should handle edge cases', () => {
      expect(StatisticalUtils.calculateSharpeRatio([], 0.02)).toBe(0);
      expect(StatisticalUtils.calculateSharpeRatio([0.05, 0.05, 0.05], 0.02)).toBe(0); // No volatility
    });
  });
});

describe('SportSpecificUtils', () => {
  describe('calculateNBAScore', () => {
    it('should calculate NBA scores correctly', () => {
      expect(SportSpecificUtils.calculateNBAScore('points', 30, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateNBAScore('points', 15, {})).toBeCloseTo(50, 0);
      expect(SportSpecificUtils.calculateNBAScore('rebounds', 16, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateNBAScore('assists', 10, {})).toBeCloseTo(100, 0);
    });
  });

  describe('calculateNFLScore', () => {
    it('should calculate NFL scores correctly', () => {
      expect(SportSpecificUtils.calculateNFLScore('passing_yards', 500, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateNFLScore('passing_yards', 250, {})).toBeCloseTo(50, 0);
      expect(SportSpecificUtils.calculateNFLScore('rushing_yards', 160, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateNFLScore('touchdowns', 2, {})).toBeCloseTo(100, 0);
    });
  });

  describe('calculateMLBScore', () => {
    it('should calculate MLB scores correctly', () => {
      expect(SportSpecificUtils.calculateMLBScore('hits', 4, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateMLBScore('hits', 2, {})).toBeCloseTo(50, 0);
      expect(SportSpecificUtils.calculateMLBScore('home_runs', 1, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateMLBScore('strikeouts', 12, {})).toBeCloseTo(100, 0);
    });
  });

  describe('calculateNHLScore', () => {
    it('should calculate NHL scores correctly', () => {
      expect(SportSpecificUtils.calculateNHLScore('goals', 1, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateNHLScore('assists', 1.4, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateNHLScore('saves', 50, {})).toBeCloseTo(100, 0);
      expect(SportSpecificUtils.calculateNHLScore('shots', 6, {})).toBeCloseTo(100, 0);
    });
  });
});