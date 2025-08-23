/**
 * Grading rules and scoring logic tests - pure function validation
 */

import {
  calculateCompositeScore,
  determineTier,
  gradeMarketOutcome,
  applyQualityFilters,
  createDefaultGradingConfig,
  validateGradingConfig,
  calculateEdgeScore,
  calculateRiskScore,
} from '../rules.js';
import {
  GradingInput,
  GradingConfig,
  FactorResult,
  GradingResult,
  MarketOutcome,
  GRADING_CONSTANTS,
} from '../types.js';

describe('Grading Rules Tests', () => {
  const mockFactors: FactorResult[] = [
    {
      factorId: 'player_performance',
      score: 80,
      confidence: 0.9,
      weight: 0.4,
      contribution: 32,
    },
    {
      factorId: 'market_analysis',
      score: 60,
      confidence: 0.7,
      weight: 0.3,
      contribution: 18,
    },
    {
      factorId: 'team_context',
      score: 70,
      confidence: 0.8,
      weight: 0.3,
      contribution: 21,
    },
  ];

  const mockConfig: GradingConfig = {
    version: '1.0.0',
    enabledFactors: ['player_performance', 'market_analysis', 'team_context'],
    factorWeights: {
      player_performance: 0.4,
      market_analysis: 0.3,
      team_context: 0.3,
    },
    tierThresholds: GRADING_CONSTANTS.TIER_THRESHOLDS,
    qualityThreshold: 0.7,
  };

  describe('calculateCompositeScore', () => {
    it('should calculate weighted average score', () => {
      const result = calculateCompositeScore(mockFactors, mockConfig);
      
      expect(result.totalScore).toBeCloseTo(71); // (80*0.4 + 60*0.3 + 70*0.3) / 1.0
      expect(result.confidenceLevel).toBeCloseTo(0.82); // (0.9*0.4 + 0.7*0.3 + 0.8*0.3) / 1.0
      expect(result.qualityScore).toBeGreaterThan(0);
    });

    it('should handle empty factors gracefully', () => {
      const result = calculateCompositeScore([], mockConfig);
      
      expect(result.totalScore).toBe(GRADING_CONSTANTS.NEUTRAL_SCORE);
      expect(result.confidenceLevel).toBe(0.1);
      expect(result.qualityScore).toBe(0.0);
    });

    it('should throw error for zero weights', () => {
      const zeroWeightFactors = mockFactors.map(f => ({ ...f, weight: 0 }));
      
      expect(() => calculateCompositeScore(zeroWeightFactors, mockConfig))
        .toThrow('No factors have positive weights');
    });

    it('should normalize for non-unit weight sums', () => {
      const unequalWeights = mockFactors.map((f, i) => ({
        ...f,
        weight: i === 0 ? 0.6 : 0.2, // Total = 1.0
      }));
      
      const result = calculateCompositeScore(unequalWeights, mockConfig);
      
      expect(result.totalScore).toBeCloseTo(72); // Weighted correctly
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThan(100);
    });

    it('should handle factors with missing metadata', () => {
      const factorsNoMetadata = mockFactors.map(f => ({
        ...f,
        metadata: undefined,
      }));
      
      const result = calculateCompositeScore(factorsNoMetadata, mockConfig);
      
      expect(result).toBeDefined();
      expect(result.qualityScore).toBeGreaterThan(0); // Should use fallback logic
    });
  });

  describe('determineTier', () => {
    it('should assign S tier for high score and confidence', () => {
      const tier = determineTier(90, 0.85, mockConfig);
      expect(tier).toBe('S');
    });

    it('should assign A tier for good score and confidence', () => {
      const tier = determineTier(75, 0.7, mockConfig);
      expect(tier).toBe('A');
    });

    it('should assign B tier for average score and confidence', () => {
      const tier = determineTier(60, 0.6, mockConfig);
      expect(tier).toBe('B');
    });

    it('should assign C tier for low score and confidence', () => {
      const tier = determineTier(45, 0.4, mockConfig);
      expect(tier).toBe('C');
    });

    it('should assign D tier for poor score or confidence', () => {
      expect(determineTier(30, 0.8, mockConfig)).toBe('D');
      expect(determineTier(80, 0.2, mockConfig)).toBe('D');
    });

    it('should require minimum confidence for higher tiers', () => {
      // High score but low confidence should not get S tier
      expect(determineTier(95, 0.5, mockConfig)).toBe('D');
      
      // Good score but insufficient confidence for A tier
      expect(determineTier(85, 0.4, mockConfig)).toBe('D');
    });
  });

  describe('gradeMarketOutcome', () => {
    const mockInput: GradingInput = {
      pickId: 'test-123',
      tenantId: 'tenant-1',
      sport: 'MLB',
      marketType: 'player_hits',
      selection: 'over',
    };

    it('should return explicit outcome result', () => {
      const outcome: MarketOutcome = { result: 'win' };
      
      const grade = gradeMarketOutcome(mockInput, outcome);
      expect(grade).toBe('win');
    });

    it('should determine outcome from result data', () => {
      const outcome: MarketOutcome = { result: 'pending' };
      const resultData = {
        outcomes: { over: 'win', under: 'loss' }
      };
      
      const grade = gradeMarketOutcome(mockInput, outcome, resultData);
      expect(grade).toBe('win');
    });

    it('should return pending for missing data', () => {
      const outcome: MarketOutcome = { result: 'pending' };
      
      const grade = gradeMarketOutcome(mockInput, outcome);
      expect(grade).toBe('pending');
    });

    it('should handle invalid outcomes gracefully', () => {
      const outcome: MarketOutcome = { result: 'pending' };
      const resultData = {
        outcomes: { over: 'invalid_result' }
      };
      
      const grade = gradeMarketOutcome(mockInput, outcome, resultData);
      expect(grade).toBe('pending');
    });
  });

  describe('applyQualityFilters', () => {
    const mockResult: GradingResult = {
      pickId: 'test-123',
      totalScore: 75,
      tier: 'A',
      confidenceLevel: 0.7,
      factorBreakdown: { factor1: 30, factor2: 25, factor3: 20 },
      gradingMetadata: {
        version: '1.0.0',
        processedAt: new Date(),
        factorsApplied: ['factor1', 'factor2', 'factor3'],
        qualityScore: 0.8,
      },
    };

    it('should pass quality filters for good result', () => {
      const { passed, reasons } = applyQualityFilters(mockResult, mockConfig);
      
      expect(passed).toBe(true);
      expect(reasons).toHaveLength(0);
    });

    it('should fail for low quality score', () => {
      const lowQualityResult = {
        ...mockResult,
        gradingMetadata: {
          ...mockResult.gradingMetadata,
          qualityScore: 0.5, // Below 0.7 threshold
        },
      };
      
      const { passed, reasons } = applyQualityFilters(lowQualityResult, mockConfig);
      
      expect(passed).toBe(false);
      expect(reasons[0]).toContain('Quality score 0.5 below threshold 0.7');
    });

    it('should fail for insufficient confidence for tier', () => {
      const lowConfidenceResult = {
        ...mockResult,
        tier: 'S' as const,
        confidenceLevel: 0.5, // Too low for S tier (requires 0.8)
      };
      
      const { passed, reasons } = applyQualityFilters(lowConfidenceResult, mockConfig);
      
      expect(passed).toBe(false);
      expect(reasons[0]).toContain('Confidence 0.500 too low for tier S');
    });

    it('should fail for extreme scores with low confidence', () => {
      const extremeResult = {
        ...mockResult,
        totalScore: 95,
        confidenceLevel: 0.5, // Too low for such extreme score
      };
      
      const { passed, reasons } = applyQualityFilters(extremeResult, mockConfig);
      
      expect(passed).toBe(false);
      expect(reasons[0]).toContain('Extreme score 95 requires higher confidence');
    });

    it('should fail for high factor variance', () => {
      const highVarianceResult = {
        ...mockResult,
        factorBreakdown: { 
          factor1: 5,   // Very low
          factor2: 95,  // Very high - creates high variance
          factor3: 50,  // Average
        },
      };
      
      const { passed, reasons } = applyQualityFilters(highVarianceResult, mockConfig);
      
      expect(passed).toBe(false);
      expect(reasons[0]).toContain('Factor scores show high variance');
    });
  });

  describe('createDefaultGradingConfig', () => {
    it('should create valid default configuration', () => {
      const config = createDefaultGradingConfig();
      
      expect(config.version).toBe(GRADING_CONSTANTS.DEFAULT_VERSION);
      expect(config.qualityThreshold).toBe(GRADING_CONSTANTS.DEFAULT_QUALITY_THRESHOLD);
      expect(config.enabledFactors.length).toBeGreaterThan(0);
      expect(Object.keys(config.factorWeights).length).toBeGreaterThan(0);
    });

    it('should apply overrides correctly', () => {
      const overrides = {
        version: '2.0.0',
        qualityThreshold: 0.9,
        factorWeights: { custom_factor: 0.5 },
      };
      
      const config = createDefaultGradingConfig(overrides);
      
      expect(config.version).toBe('2.0.0');
      expect(config.qualityThreshold).toBe(0.9);
      expect(config.factorWeights.custom_factor).toBe(0.5);
    });
  });

  describe('validateGradingConfig', () => {
    it('should validate correct configuration', () => {
      const { valid, errors } = validateGradingConfig(mockConfig);
      
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid weight sum', () => {
      const badConfig = {
        ...mockConfig,
        factorWeights: {
          factor1: 0.3,
          factor2: 0.3,
          factor3: 0.5, // Sum = 1.1, not 1.0
        },
      };
      
      const { valid, errors } = validateGradingConfig(badConfig);
      
      expect(valid).toBe(false);
      expect(errors[0]).toContain('Factor weights sum to 1.100, should be 1.0');
    });

    it('should detect invalid individual weights', () => {
      const badConfig = {
        ...mockConfig,
        factorWeights: {
          factor1: -0.1, // Negative weight
          factor2: 0.6,
          factor3: 0.5,
        },
      };
      
      const { valid, errors } = validateGradingConfig(badConfig);
      
      expect(valid).toBe(false);
      expect(errors[0]).toContain('Factor weight for factor1 is -0.1');
    });

    it('should detect invalid tier thresholds', () => {
      const badConfig = {
        ...mockConfig,
        tierThresholds: {
          S: 80,
          A: 90, // Should be less than S
          B: 70,
          C: 60,
        },
      };
      
      const { valid, errors } = validateGradingConfig(badConfig);
      
      expect(valid).toBe(false);
      expect(errors[0]).toContain('Tier thresholds must be in descending order');
    });

    it('should detect missing weights for enabled factors', () => {
      const badConfig = {
        ...mockConfig,
        enabledFactors: ['missing_factor'],
      };
      
      const { valid, errors } = validateGradingConfig(badConfig);
      
      expect(valid).toBe(false);
      expect(errors[0]).toContain('Enabled factor missing_factor has no corresponding weight');
    });
  });

  describe('calculateEdgeScore', () => {
    it('should calculate positive edge correctly', () => {
      expect(calculateEdgeScore(75)).toBe(25);
      expect(calculateEdgeScore(90)).toBe(40);
    });

    it('should return zero for neutral or negative scores', () => {
      expect(calculateEdgeScore(50)).toBe(0);
      expect(calculateEdgeScore(30)).toBe(0);
    });
  });

  describe('calculateRiskScore', () => {
    it('should calculate higher risk for low confidence', () => {
      const highRisk = calculateRiskScore(mockFactors, 0.3);
      const lowRisk = calculateRiskScore(mockFactors, 0.9);
      
      expect(highRisk).toBeGreaterThan(lowRisk);
      expect(highRisk).toBeGreaterThan(20);
      expect(lowRisk).toBeLessThan(20);
    });

    it('should factor in factor variance', () => {
      const consistentFactors = mockFactors.map(f => ({ ...f, score: 70 }));
      const variantFactors = [
        { ...mockFactors[0], score: 10 },
        { ...mockFactors[1], score: 90 },
        { ...mockFactors[2], score: 50 },
      ];
      
      const consistentRisk = calculateRiskScore(consistentFactors, 0.8);
      const variantRisk = calculateRiskScore(variantFactors, 0.8);
      
      expect(variantRisk).toBeGreaterThan(consistentRisk);
    });

    it('should penalize missing data', () => {
      const incompleteFactors = mockFactors.map(f => ({
        ...f,
        metadata: { dataAvailable: false },
      }));
      
      const incompleteRisk = calculateRiskScore(incompleteFactors, 0.8);
      const completeRisk = calculateRiskScore(mockFactors, 0.8);
      
      expect(incompleteRisk).toBeGreaterThan(completeRisk);
    });

    it('should stay within valid bounds', () => {
      const extremeRisk = calculateRiskScore([], 0.0);
      
      expect(extremeRisk).toBeGreaterThanOrEqual(0);
      expect(extremeRisk).toBeLessThanOrEqual(100);
    });
  });
});