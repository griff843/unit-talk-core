/**
 * Boundary conditions and edge case tests
 */

import {
  gradeProposition,
  gradeBatchPropositions,
  compareGradingResults,
} from '../scoring.js';
import {
  createDefaultGradingConfig,
  calculateCompositeScore,
  determineTier,
} from '../rules.js';
import {
  calculatePlayerPerformanceFactor,
  calculateAllFactors,
} from '../features.js';
import {
  GradingInput,
  GradingConfig,
  GRADING_CONSTANTS,
} from '../types.js';

describe('Boundary Conditions and Edge Cases', () => {
  const minimalInput: GradingInput = {
    pickId: 'min-test',
    tenantId: 'tenant',
    sport: 'MLB',
    marketType: 'hits',
  };

  const defaultConfig = createDefaultGradingConfig();

  describe('Score Boundaries', () => {
    it('should handle minimum possible scores', () => {
      // Create factors that would result in very low scores
      const lowFactors = [
        {
          factorId: 'test_factor',
          score: 0,
          confidence: 0.1,
          weight: 1.0,
          contribution: 0,
        }
      ];

      const result = calculateCompositeScore(lowFactors, defaultConfig);
      
      expect(result.totalScore).toBe(0);
      expect(result.confidenceLevel).toBe(0.1);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle maximum possible scores', () => {
      const highFactors = [
        {
          factorId: 'test_factor',
          score: 100,
          confidence: 1.0,
          weight: 1.0,
          contribution: 100,
          metadata: { dataAvailable: true },
        }
      ];

      const result = calculateCompositeScore(highFactors, defaultConfig);
      
      expect(result.totalScore).toBe(100);
      expect(result.confidenceLevel).toBe(1.0);
      expect(result.qualityScore).toBeLessThanOrEqual(1.0);
    });

    it('should handle exact tier boundaries', () => {
      const tierThresholds = GRADING_CONSTANTS.TIER_THRESHOLDS;
      
      // Test scores exactly at tier boundaries
      expect(determineTier(tierThresholds.S, 0.8, defaultConfig)).toBe('S');
      expect(determineTier(tierThresholds.S - 0.1, 0.8, defaultConfig)).toBe('A');
      
      expect(determineTier(tierThresholds.A, 0.65, defaultConfig)).toBe('A');
      expect(determineTier(tierThresholds.A - 0.1, 0.65, defaultConfig)).toBe('B');
      
      expect(determineTier(tierThresholds.B, 0.5, defaultConfig)).toBe('B');
      expect(determineTier(tierThresholds.B - 0.1, 0.5, defaultConfig)).toBe('C');
      
      expect(determineTier(tierThresholds.C, 0.3, defaultConfig)).toBe('C');
      expect(determineTier(tierThresholds.C - 0.1, 0.3, defaultConfig)).toBe('D');
    });

    it('should handle confidence boundary conditions', () => {
      // Test confidence boundaries for tier requirements
      expect(determineTier(90, 0.799, defaultConfig)).toBe('D'); // Just below S requirement
      expect(determineTier(90, 0.8, defaultConfig)).toBe('S');   // Exactly at S requirement
      
      expect(determineTier(75, 0.649, defaultConfig)).toBe('D'); // Just below A requirement
      expect(determineTier(75, 0.65, defaultConfig)).toBe('A');  // Exactly at A requirement
    });
  });

  describe('Input Validation Boundaries', () => {
    it('should handle empty string values', () => {
      const emptyStringInput = {
        ...minimalInput,
        pickId: '',
        sport: '',
        marketType: '',
      };

      expect(() => gradeProposition(emptyStringInput, defaultConfig))
        .toThrow('Missing required input fields');
    });

    it('should handle whitespace-only values', () => {
      const whitespaceInput = {
        ...minimalInput,
        pickId: '   ',
        sport: '\t\n',
        marketType: '  ',
      };

      // Should still fail validation as whitespace isn't meaningful
      expect(() => gradeProposition(whitespaceInput, defaultConfig))
        .toThrow('Missing required input fields');
    });

    it('should handle very long string values', () => {
      const veryLongString = 'x'.repeat(1000);
      const longStringInput = {
        ...minimalInput,
        pickId: veryLongString,
        sport: veryLongString,
        marketType: veryLongString,
      };

      // Should not throw - long strings are valid
      const result = gradeProposition(longStringInput, defaultConfig);
      expect(result.pickId).toBe(veryLongString);
    });

    it('should handle extreme numeric values', () => {
      const extremeInput = {
        ...minimalInput,
        odds: Number.MAX_SAFE_INTEGER,
        line: Number.MIN_SAFE_INTEGER,
      };

      // Should handle extreme numbers gracefully
      const result = gradeProposition(extremeInput, defaultConfig);
      expect(result).toBeDefined();
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Configuration Boundaries', () => {
    it('should handle configuration with zero weights (sum to 1)', () => {
      const zeroWeightConfig = createDefaultGradingConfig({
        enabledFactors: ['player_performance', 'team_context'],
        factorWeights: {
          player_performance: 0.0,
          team_context: 1.0,
        },
      });

      const result = gradeProposition(minimalInput, zeroWeightConfig);
      
      expect(result).toBeDefined();
      expect(result.factorBreakdown.player_performance).toBe(0);
    });

    it('should handle configuration with very small weights', () => {
      const smallWeightConfig = createDefaultGradingConfig({
        enabledFactors: ['player_performance'],
        factorWeights: {
          player_performance: 0.001,
        },
      });

      const result = gradeProposition(minimalInput, smallWeightConfig);
      
      expect(result).toBeDefined();
      expect(result.factorBreakdown.player_performance).toBeCloseTo(0, 5);
    });

    it('should handle tier thresholds at boundaries', () => {
      const boundaryConfig = createDefaultGradingConfig({
        tierThresholds: {
          S: 99.99,
          A: 99.98,
          B: 99.97,
          C: 99.96,
        },
      });

      // Most scores should be D tier with such high thresholds
      const result = gradeProposition(minimalInput, boundaryConfig);
      expect(result.tier).toBe('D');
    });

    it('should handle quality threshold boundaries', () => {
      const strictQualityConfig = createDefaultGradingConfig({
        qualityThreshold: 0.999,
      });

      // Should throw in strict mode due to high quality requirement
      expect(() => gradeProposition(minimalInput, strictQualityConfig))
        .toThrow('Quality check failed');
    });
  });

  describe('Determinism and Consistency', () => {
    it('should produce identical results for identical inputs', () => {
      const results = Array.from({ length: 10 }, () => 
        gradeProposition(minimalInput, defaultConfig)
      );

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        const comparison = compareGradingResults(results[0], results[i]);
        expect(comparison.identical).toBe(true);
      }
    });

    it('should maintain consistency across batch processing', () => {
      const singleInputs = Array.from({ length: 5 }, (_, i) => ({
        ...minimalInput,
        pickId: `single-${i}`,
      }));

      // Process individually
      const individualResults = singleInputs.map(input => 
        gradeProposition(input, defaultConfig)
      );

      // Process as batch
      const batchResult = gradeBatchPropositions(singleInputs, defaultConfig);

      // Results should be identical
      expect(batchResult.results).toHaveLength(5);
      
      for (let i = 0; i < singleInputs.length; i++) {
        const comparison = compareGradingResults(
          individualResults[i], 
          batchResult.results[i]
        );
        expect(comparison.identical).toBe(true);
      }
    });

    it('should handle concurrent execution scenarios', async () => {
      const concurrentPromises = Array.from({ length: 20 }, (_, i) => 
        Promise.resolve(gradeProposition({
          ...minimalInput,
          pickId: `concurrent-${i}`,
        }, defaultConfig))
      );

      const results = await Promise.all(concurrentPromises);
      
      // All results should be valid and consistent for same base input
      const baseResults = results.filter((_, i) => i % 2 === 0);
      for (let i = 1; i < baseResults.length; i++) {
        expect(baseResults[i].totalScore).toBe(baseResults[0].totalScore);
        expect(baseResults[i].tier).toBe(baseResults[0].tier);
      }
    });
  });

  describe('Precision and Numerical Stability', () => {
    it('should maintain precision with many small factors', () => {
      const manySmallFactors = Array.from({ length: 100 }, (_, i) => ({
        factorId: `factor_${i}`,
        score: 50 + (i % 10) - 5, // Scores from 45 to 54
        confidence: 0.5 + (i % 20) * 0.025, // Confidence from 0.5 to 0.975
        weight: 0.01, // Total weight = 1.0
        contribution: 0,
      }));

      const result = calculateCompositeScore(manySmallFactors, defaultConfig);
      
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThan(100);
      expect(Number.isFinite(result.totalScore)).toBe(true);
      expect(Number.isFinite(result.confidenceLevel)).toBe(true);
    });

    it('should handle floating point edge cases', () => {
      const fpFactors = [
        {
          factorId: 'fp_test',
          score: 0.1 + 0.2, // Classic FP precision issue
          confidence: 1.0 / 3.0, // Non-terminating decimal
          weight: 1.0,
          contribution: 0,
        }
      ];

      const result = calculateCompositeScore(fpFactors, defaultConfig);
      
      expect(Number.isFinite(result.totalScore)).toBe(true);
      expect(Number.isFinite(result.confidenceLevel)).toBe(true);
      expect(result.totalScore).toBeCloseTo(0.3, 10);
    });

    it('should handle very close to zero weights', () => {
      const nearZeroConfig = createDefaultGradingConfig({
        enabledFactors: ['player_performance', 'team_context'],
        factorWeights: {
          player_performance: Number.EPSILON,
          team_context: 1.0 - Number.EPSILON,
        },
      });

      const result = gradeProposition(minimalInput, nearZeroConfig);
      
      expect(result).toBeDefined();
      expect(Number.isFinite(result.totalScore)).toBe(true);
      expect(result.factorBreakdown.player_performance).toBeCloseTo(0, 15);
    });
  });

  describe('Memory and Performance Boundaries', () => {
    it('should handle large batch processing efficiently', () => {
      const largeBatch = Array.from({ length: 1000 }, (_, i) => ({
        ...minimalInput,
        pickId: `batch-${i}`,
      }));

      const startTime = Date.now();
      const result = gradeBatchPropositions(largeBatch, defaultConfig);
      const endTime = Date.now();

      expect(result.results).toHaveLength(1000);
      expect(result.summary.successful).toBe(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in <5s
    });

    it('should handle deeply nested context data', () => {
      const deepContext = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  playerStats: { battingAverage: 0.300 }
                }
              }
            }
          }
        }
      };

      // Should handle deep nesting without stack overflow
      const result = gradeProposition(minimalInput, defaultConfig, deepContext);
      expect(result).toBeDefined();
    });

    it('should handle context data with circular references safely', () => {
      const circularContext: any = { playerStats: { battingAverage: 0.300 } };
      circularContext.self = circularContext; // Create circular reference

      // Should not crash with circular references
      const result = gradeProposition(minimalInput, defaultConfig, circularContext);
      expect(result).toBeDefined();
    });
  });
});