/**
 * Feature calculation tests - pure function validation
 */

import {
  calculatePlayerPerformanceFactor,
  calculateTeamContextFactor,
  calculateMarketAnalysisFactor,
  calculateHistoricalTrendsFactor,
  calculateSituationalFactor,
  calculateAllFactors,
  validateFactorResults,
} from '../features.js';
import {
  GradingInput,
  GradingConfig,
  GRADING_CONSTANTS,
} from '../types.js';

describe('Feature Calculation Tests', () => {
  const mockInput: GradingInput = {
    pickId: 'test-123',
    tenantId: 'tenant-1',
    sport: 'MLB',
    league: 'MLB',
    marketType: 'player_hits',
    player: 'player-123',
    odds: -110,
  };

  const mockConfig: GradingConfig = {
    version: '1.0.0',
    enabledFactors: ['player_performance', 'team_context', 'market_analysis'],
    factorWeights: {
      player_performance: 0.4,
      team_context: 0.3,
      market_analysis: 0.3,
    },
    tierThresholds: GRADING_CONSTANTS.TIER_THRESHOLDS,
    qualityThreshold: 0.7,
  };

  describe('calculatePlayerPerformanceFactor', () => {
    it('should return neutral score with no historical data', () => {
      const result = calculatePlayerPerformanceFactor(mockInput);
      
      expect(result.factorId).toBe('player_performance');
      expect(result.score).toBe(GRADING_CONSTANTS.NEUTRAL_SCORE);
      expect(result.confidence).toBe(0.5);
      expect(result.weight).toBe(0.25);
      expect(result.metadata?.sport).toBe('MLB');
    });

    it('should calculate batting performance for MLB hits market', () => {
      const historicalData = {
        playerStats: { battingAverage: 0.300 }
      };

      const result = calculatePlayerPerformanceFactor(mockInput, historicalData);
      
      expect(result.score).toBe(51); // 30 + (0.3 * 70)
      expect(result.confidence).toBe(0.8);
      expect(result.metadata?.dataAvailable).toBe(true);
    });

    it('should handle NBA points per game', () => {
      const nbaInput = { ...mockInput, sport: 'NBA', marketType: 'player_points' };
      const historicalData = {
        playerStats: { ppg: 25 }
      };

      const result = calculatePlayerPerformanceFactor(nbaInput, historicalData);
      
      expect(result.score).toBe(90); // 40 + (25 * 2)
      expect(result.confidence).toBe(0.75);
    });

    it('should handle missing player stats gracefully', () => {
      const historicalData = {};

      const result = calculatePlayerPerformanceFactor(mockInput, historicalData);
      
      expect(result.score).toBe(GRADING_CONSTANTS.NEUTRAL_SCORE);
      expect(result.confidence).toBe(0.5);
      expect(result.metadata?.dataAvailable).toBe(false);
    });
  });

  describe('calculateTeamContextFactor', () => {
    it('should return neutral score with no team data', () => {
      const result = calculateTeamContextFactor(mockInput);
      
      expect(result.factorId).toBe('team_context');
      expect(result.score).toBe(GRADING_CONSTANTS.NEUTRAL_SCORE);
      expect(result.confidence).toBe(0.4);
    });

    it('should calculate strength differential', () => {
      const teamData = {
        team: { winRate: 0.600 },
        opponent: { winRate: 0.400 },
        isHome: true,
      };

      const result = calculateTeamContextFactor(mockInput, teamData);
      
      expect(result.score).toBe(65); // 50 + (0.2 * 50) + 5 (home)
      expect(result.confidence).toBe(0.7);
      expect(result.metadata?.isHome).toBe(true);
    });

    it('should handle away games', () => {
      const teamData = {
        team: { winRate: 0.500 },
        opponent: { winRate: 0.500 },
        isHome: false,
      };

      const result = calculateTeamContextFactor(mockInput, teamData);
      
      expect(result.score).toBe(50); // No differential, no home advantage
      expect(result.metadata?.isHome).toBe(false);
    });
  });

  describe('calculateMarketAnalysisFactor', () => {
    it('should calculate implied probability from positive odds', () => {
      const inputWithOdds = { ...mockInput, odds: 150 };
      
      const result = calculateMarketAnalysisFactor(inputWithOdds);
      
      expect(result.factorId).toBe('market_analysis');
      expect(result.score).toBeCloseTo(50); // Fair probability assumption
      expect(result.metadata?.odds).toBe(150);
      expect(result.metadata?.impliedProbability).toBeCloseTo(0.4);
    });

    it('should calculate implied probability from negative odds', () => {
      const inputWithOdds = { ...mockInput, odds: -200 };
      
      const result = calculateMarketAnalysisFactor(inputWithOdds);
      
      expect(result.metadata?.impliedProbability).toBeCloseTo(0.667, 2);
    });

    it('should adjust confidence based on market volume', () => {
      const marketData = { volume: 5000 };
      
      const result = calculateMarketAnalysisFactor(mockInput, marketData);
      
      expect(result.confidence).toBeCloseTo(0.6); // 0.3 + (5000/10000) * 0.6
    });
  });

  describe('calculateHistoricalTrendsFactor', () => {
    it('should return neutral score with no trends', () => {
      const result = calculateHistoricalTrendsFactor(mockInput);
      
      expect(result.factorId).toBe('historical_trends');
      expect(result.score).toBe(GRADING_CONSTANTS.NEUTRAL_SCORE);
      expect(result.confidence).toBe(0.3);
    });

    it('should calculate weighted trend score', () => {
      const trends = {
        trends: {
          last10Games: 0.8,
          seasonAvg: 0.6,
          vsOpponent: 0.7,
          gamesSample: 30,
        }
      };

      const result = calculateHistoricalTrendsFactor(mockInput, trends);
      
      expect(result.score).toBe(75); // 30 + (0.8*25) + (0.6*25) + (0.7*20)
      expect(result.confidence).toBe(0.8); // Boosted for sample size > 20
    });
  });

  describe('calculateSituationalFactor', () => {
    it('should return neutral score with no situational data', () => {
      const result = calculateSituationalFactor(mockInput);
      
      expect(result.factorId).toBe('situational_factors');
      expect(result.score).toBe(GRADING_CONSTANTS.NEUTRAL_SCORE);
      expect(result.confidence).toBe(0.4);
    });

    it('should factor in weather conditions for outdoor sports', () => {
      const situationalData = {
        weather: { windSpeed: 20, temperature: 35 },
        injuries: ['player-456'],
        daysRest: 2,
      };

      const result = calculateSituationalFactor(mockInput, situationalData);
      
      // Wind penalty (-10) + injury penalty (-5) + neutral rest
      expect(result.score).toBe(35);
      expect(result.metadata?.weatherConsidered).toBe(true);
      expect(result.metadata?.injuriesCount).toBe(1);
    });

    it('should handle rest advantages and penalties', () => {
      const wellRested = { daysRest: 4 };
      const backToBack = { daysRest: 0 };

      const restedResult = calculateSituationalFactor(mockInput, wellRested);
      const tiredResult = calculateSituationalFactor(mockInput, backToBack);
      
      expect(restedResult.score).toBe(55); // +5 for rest
      expect(tiredResult.score).toBe(40);  // -10 for fatigue
    });
  });

  describe('calculateAllFactors', () => {
    it('should calculate enabled factors with weights', () => {
      const contextData = {
        historical: { playerStats: { battingAverage: 0.280 } },
        team: { team: { winRate: 0.550 }, opponent: { winRate: 0.450 } },
      };

      const factors = calculateAllFactors(mockInput, mockConfig, contextData);
      
      expect(factors).toHaveLength(3);
      expect(factors.map(f => f.factorId)).toEqual([
        'player_performance',
        'team_context', 
        'market_analysis'
      ]);

      // Check weights are applied
      expect(factors[0].weight).toBe(0.4);
      expect(factors[1].weight).toBe(0.3);
      expect(factors[2].weight).toBe(0.3);

      // Check contributions are calculated
      factors.forEach(factor => {
        expect(factor.contribution).toBe(factor.score * factor.weight);
      });
    });

    it('should skip disabled factors', () => {
      const limitedConfig: GradingConfig = {
        ...mockConfig,
        enabledFactors: ['player_performance'],
      };

      const factors = calculateAllFactors(mockInput, limitedConfig);
      
      expect(factors).toHaveLength(1);
      expect(factors[0].factorId).toBe('player_performance');
    });
  });

  describe('validateFactorResults', () => {
    it('should validate correct factor results', () => {
      const validFactors = [
        {
          factorId: 'test',
          score: 75,
          confidence: 0.8,
          weight: 0.5,
          contribution: 37.5,
        }
      ];

      expect(validateFactorResults(validFactors)).toBe(true);
    });

    it('should reject invalid scores', () => {
      const invalidScore = [
        {
          factorId: 'test',
          score: 150, // Invalid
          confidence: 0.8,
          weight: 0.5,
          contribution: 75,
        }
      ];

      expect(validateFactorResults(invalidScore)).toBe(false);
    });

    it('should reject invalid confidence values', () => {
      const invalidConfidence = [
        {
          factorId: 'test',
          score: 75,
          confidence: 1.5, // Invalid
          weight: 0.5,
          contribution: 37.5,
        }
      ];

      expect(validateFactorResults(invalidConfidence)).toBe(false);
    });

    it('should reject invalid weights', () => {
      const invalidWeight = [
        {
          factorId: 'test',
          score: 75,
          confidence: 0.8,
          weight: -0.1, // Invalid
          contribution: -7.5,
        }
      ];

      expect(validateFactorResults(invalidWeight)).toBe(false);
    });
  });
});