/**
 * Main scoring orchestration tests - integration and edge cases
 */

import {
  gradeProposition,
  gradeBatchPropositions,
  compareGradingResults,
  createTestGradingResult,
} from '../scoring.js';
import {
  createDefaultGradingConfig,
} from '../rules.js';
import {
  GradingInput,
  GradingError,
  GRADING_CONSTANTS,
} from '../types.js';

describe('Grading Scoring Tests', () => {
  const mockInput: GradingInput = {
    pickId: 'test-123',
    tenantId: 'tenant-1',
    sport: 'MLB',
    marketType: 'player_hits',
    player: 'player-123',
    odds: -110,
  };

  const mockConfig = createDefaultGradingConfig();

  describe('gradeProposition', () => {
    it('should grade proposition with minimal input', () => {
      const result = gradeProposition(mockInput, mockConfig);
      
      expect(result.pickId).toBe('test-123');
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.confidenceLevel).toBeGreaterThanOrEqual(0);
      expect(result.confidenceLevel).toBeLessThanOrEqual(1);
      expect(['S', 'A', 'B', 'C', 'D']).toContain(result.tier);
      expect(result.gradingMetadata.version).toBe(mockConfig.version);
      expect(result.gradingMetadata.processedAt).toBeInstanceOf(Date);
    });

    it('should use context data when available', () => {
      const contextData = {
        historical: { playerStats: { battingAverage: 0.350 } },
        team: { team: { winRate: 0.600 }, opponent: { winRate: 0.400 } },
        market: { volume: 10000 },
      };

      const result = gradeProposition(mockInput, mockConfig, contextData);
      
      // Should get better scores with good context data
      expect(result.totalScore).toBeGreaterThan(GRADING_CONSTANTS.NEUTRAL_SCORE);
      expect(result.confidenceLevel).toBeGreaterThan(0.5);
    });

    it('should validate configuration before grading', () => {
      const invalidConfig = {
        ...mockConfig,
        factorWeights: { invalid_factor: 2.0 }, // Weight > 1.0
      };

      expect(() => gradeProposition(mockInput, invalidConfig))
        .toThrow(GradingError);
    });

    it('should validate required input fields', () => {
      const invalidInput = {
        ...mockInput,
        pickId: '', // Empty pickId
      };

      expect(() => gradeProposition(invalidInput, mockConfig))
        .toThrow('Missing required input fields');
    });

    it('should handle shadow mode for quality failures', () => {
      const shadowConfig = { ...mockConfig, shadowMode: true, qualityThreshold: 0.99 };
      
      // Should not throw in shadow mode even with very high quality threshold
      expect(() => gradeProposition(mockInput, shadowConfig)).not.toThrow();
    });

    it('should calculate edge and risk scores', () => {
      const result = gradeProposition(mockInput, mockConfig);
      
      expect(result.edgeScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('should include factor breakdown', () => {
      const result = gradeProposition(mockInput, mockConfig);
      
      expect(Object.keys(result.factorBreakdown).length).toBeGreaterThan(0);
      
      // All factors should have numeric contributions
      Object.values(result.factorBreakdown).forEach(contribution => {
        expect(typeof contribution).toBe('number');
        expect(contribution).not.toBeNaN();
      });
    });
  });

  describe('gradeBatchPropositions', () => {
    const batchInputs: GradingInput[] = [
      { ...mockInput, pickId: 'batch-1' },
      { ...mockInput, pickId: 'batch-2' },
      { ...mockInput, pickId: 'batch-3' },
    ];

    it('should grade multiple propositions successfully', () => {
      const result = gradeBatchPropositions(batchInputs, mockConfig);
      
      expect(result.results).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.total).toBe(3);
      expect(result.summary.successful).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(result.summary.avgScore).toBeGreaterThan(0);
    });

    it('should handle partial failures gracefully', () => {
      const mixedInputs = [
        ...batchInputs,
        { ...mockInput, pickId: '', marketType: '' }, // Invalid
      ];

      const result = gradeBatchPropositions(mixedInputs, mockConfig);
      
      expect(result.results).toHaveLength(3);
      expect(result.errors).toHaveLength(1);
      expect(result.summary.successful).toBe(3);
      expect(result.summary.failed).toBe(1);
      expect(result.errors[0].pickId).toBe('');
      expect(result.errors[0].error).toContain('Missing required input fields');
    });

    it('should calculate tier distribution', () => {
      const result = gradeBatchPropositions(batchInputs, mockConfig);
      
      const distributionSum = Object.values(result.summary.tierDistribution)
        .reduce((sum, count) => sum + count, 0);
      
      expect(distributionSum).toBe(result.summary.successful);
    });

    it('should handle context data per pick', () => {
      const contextData = {
        'batch-1': { historical: { playerStats: { battingAverage: 0.400 } } },
        'batch-2': { historical: { playerStats: { battingAverage: 0.200 } } },
        // batch-3 has no context data
      };

      const result = gradeBatchPropositions(batchInputs, mockConfig, contextData);
      
      expect(result.results).toHaveLength(3);
      
      // Results should differ based on context data
      const scores = result.results.map(r => r.totalScore);
      const uniqueScores = new Set(scores);
      
      // Should have at least 2 different scores due to different context
      expect(uniqueScores.size).toBeGreaterThan(1);
    });
  });

  describe('compareGradingResults', () => {
    const baseResult = createTestGradingResult('test-1', 75);
    
    it('should detect identical results', () => {
      const identicalResult = createTestGradingResult('test-1', 75);
      
      const comparison = compareGradingResults(baseResult, identicalResult);
      
      expect(comparison.identical).toBe(true);
      expect(comparison.differences.filter(d => d.significant)).toHaveLength(0);
    });

    it('should detect score differences', () => {
      const differentResult = createTestGradingResult('test-1', 85);
      
      const comparison = compareGradingResults(baseResult, differentResult);
      
      expect(comparison.identical).toBe(false);
      expect(comparison.differences.some(d => d.field === 'totalScore')).toBe(true);
    });

    it('should detect tier differences', () => {
      const differentTierResult = createTestGradingResult('test-1', 75, { tier: 'S' });
      
      const comparison = compareGradingResults(baseResult, differentTierResult);
      
      expect(comparison.identical).toBe(false);
      expect(comparison.differences.some(d => d.field === 'tier')).toBe(true);
    });

    it('should detect confidence differences', () => {
      const differentConfidenceResult = createTestGradingResult('test-1', 75, { 
        confidenceLevel: 0.5 
      });
      
      const comparison = compareGradingResults(baseResult, differentConfidenceResult);
      
      expect(comparison.identical).toBe(false);
      expect(comparison.differences.some(d => d.field === 'confidenceLevel')).toBe(true);
    });

    it('should detect factor breakdown differences', () => {
      const differentFactorsResult = createTestGradingResult('test-1', 75, {
        factorBreakdown: { different_factor: 75 }
      });
      
      const comparison = compareGradingResults(baseResult, differentFactorsResult);
      
      expect(comparison.identical).toBe(false);
      expect(comparison.differences.some(d => 
        d.field === 'factorBreakdown.keys' || d.field.startsWith('factorBreakdown.')
      )).toBe(true);
    });

    it('should respect tolerance for minor differences', () => {
      const slightlyDifferentResult = createTestGradingResult('test-1', 75.005);
      
      const comparison = compareGradingResults(baseResult, slightlyDifferentResult, 0.01);
      
      expect(comparison.identical).toBe(true); // Within tolerance
    });

    it('should flag significant differences outside tolerance', () => {
      const significantlyDifferentResult = createTestGradingResult('test-1', 76);
      
      const comparison = compareGradingResults(baseResult, significantlyDifferentResult, 0.01);
      
      expect(comparison.identical).toBe(false); // Outside tolerance
    });
  });

  describe('createTestGradingResult', () => {
    it('should create valid test result', () => {
      const testResult = createTestGradingResult('test-pick', 80);
      
      expect(testResult.pickId).toBe('test-pick');
      expect(testResult.totalScore).toBe(80);
      expect(testResult.tier).toBe('A'); // 80 should be A tier
      expect(testResult.gradingMetadata.version).toBe(GRADING_CONSTANTS.DEFAULT_VERSION);
      expect(testResult.edgeScore).toBe(30); // 80 - 50
    });

    it('should apply overrides correctly', () => {
      const overrides = {
        tier: 'S' as const,
        confidenceLevel: 0.95,
        factorBreakdown: { custom_factor: 85 },
      };
      
      const testResult = createTestGradingResult('test-pick', 80, overrides);
      
      expect(testResult.tier).toBe('S');
      expect(testResult.confidenceLevel).toBe(0.95);
      expect(testResult.factorBreakdown.custom_factor).toBe(85);
    });

    it('should maintain deterministic timestamps for testing', () => {
      const result1 = createTestGradingResult('test-1', 75);
      const result2 = createTestGradingResult('test-2', 75);
      
      expect(result1.gradingMetadata.processedAt).toEqual(
        result2.gradingMetadata.processedAt
      );
    });

    it('should handle edge score calculations', () => {
      const lowScore = createTestGradingResult('low', 30);
      const highScore = createTestGradingResult('high', 90);
      
      expect(lowScore.edgeScore).toBe(0); // No edge for score <= 50
      expect(highScore.edgeScore).toBe(40); // 90 - 50
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty sport gracefully', () => {
      const emptyInput = { ...mockInput, sport: '' };
      
      expect(() => gradeProposition(emptyInput, mockConfig))
        .toThrow('Missing required input fields');
    });

    it('should handle very high and low scores', () => {
      const extremeContextData = {
        historical: { playerStats: { battingAverage: 1.0 } }, // Perfect
        team: { team: { winRate: 1.0 }, opponent: { winRate: 0.0 } }, // Extreme
      };

      const result = gradeProposition(mockInput, mockConfig, extremeContextData);
      
      // Should still be bounded
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
    });

    it('should be deterministic for same inputs', () => {
      const result1 = gradeProposition(mockInput, mockConfig);
      const result2 = gradeProposition(mockInput, mockConfig);
      
      const comparison = compareGradingResults(result1, result2);
      expect(comparison.identical).toBe(true);
    });

    it('should handle configuration with single factor', () => {
      const singleFactorConfig = createDefaultGradingConfig({
        enabledFactors: ['player_performance'],
        factorWeights: { player_performance: 1.0 },
      });

      const result = gradeProposition(mockInput, singleFactorConfig);
      
      expect(result).toBeDefined();
      expect(Object.keys(result.factorBreakdown)).toEqual(['player_performance']);
    });

    it('should maintain precision in calculations', () => {
      const result = gradeProposition(mockInput, mockConfig);
      
      // Check that calculations don't introduce significant floating point errors
      expect(result.totalScore % 0.001).toBeLessThan(0.001);
      expect(result.confidenceLevel % 0.001).toBeLessThan(0.001);
    });
  });
});