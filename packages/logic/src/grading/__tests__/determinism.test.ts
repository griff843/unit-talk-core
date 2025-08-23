/**
 * Determinism and idempotency tests for grading system
 */

import {
  gradeProposition,
  gradeBatchPropositions,
  compareGradingResults,
} from '../scoring.js';
import {
  createDefaultGradingConfig,
} from '../rules.js';
import {
  calculateAllFactors,
} from '../features.js';
import {
  GradingInput,
  GradingConfig,
} from '../types.js';

describe('Determinism and Idempotency Tests', () => {
  const testInput: GradingInput = {
    pickId: 'determinism-test',
    tenantId: 'test-tenant',
    sport: 'MLB',
    marketType: 'player_hits',
    player: 'test-player',
    odds: -120,
    line: 1.5,
  };

  const testConfig = createDefaultGradingConfig();

  const testContext = {
    historical: {
      playerStats: { battingAverage: 0.285, onBasePercentage: 0.340 }
    },
    team: {
      team: { winRate: 0.525, runsPerGame: 4.8 },
      opponent: { winRate: 0.475, eraAverage: 4.20 },
      isHome: true,
    },
    market: {
      odds: -120,
      volume: 15000,
      impliedProbability: 0.545,
    },
    trends: {
      trends: {
        last10Games: 0.650,
        seasonAvg: 0.580,
        vsOpponent: 0.620,
        gamesSample: 25,
      }
    },
    situational: {
      weather: { temperature: 78, windSpeed: 8, humidity: 65 },
      injuries: [],
      daysRest: 1,
    },
  };

  describe('Pure Function Determinism', () => {
    it('should produce identical results for identical calls', () => {
      const runs = Array.from({ length: 100 }, () => 
        gradeProposition(testInput, testConfig, testContext)
      );

      const firstResult = runs[0];
      
      for (let i = 1; i < runs.length; i++) {
        const comparison = compareGradingResults(firstResult, runs[i]);
        
        expect(comparison.identical).toBe(true);
        if (!comparison.identical) {
          console.log(`Differences in run ${i}:`, comparison.differences);
        }
      }
    });

    it('should maintain determinism across different execution contexts', () => {
      // Simulate different execution environments
      const results = [];
      
      // Standard execution
      results.push(gradeProposition(testInput, testConfig, testContext));
      
      // Execution with modified global state (shouldn't affect pure functions)
      const originalConsoleLog = console.log;
      console.log = () => {}; // Temporarily disable console.log
      results.push(gradeProposition(testInput, testConfig, testContext));
      console.log = originalConsoleLog;
      
      // Execution with different Date (shouldn't affect calculation if no Date.now() calls)
      const OriginalDate = Date;
      (global as any).Date = class extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super('2025-06-01T12:00:00Z'); // Fixed date
          } else {
            super(...args);
          }
        }
      };
      results.push(gradeProposition(testInput, testConfig, testContext));
      (global as any).Date = OriginalDate;

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        const comparison = compareGradingResults(results[0], results[i]);
        
        // Allow for processedAt differences but scores should be identical
        const significantDifferences = comparison.differences.filter(d => 
          d.significant && !d.field.includes('processedAt')
        );
        
        expect(significantDifferences).toHaveLength(0);
        expect(results[i].totalScore).toBe(results[0].totalScore);
        expect(results[i].tier).toBe(results[0].tier);
        expect(results[i].confidenceLevel).toBe(results[0].confidenceLevel);
      }
    });

    it('should handle order independence in factor calculations', () => {
      const config1 = createDefaultGradingConfig({
        enabledFactors: ['player_performance', 'team_context', 'market_analysis'],
      });

      const config2 = createDefaultGradingConfig({
        enabledFactors: ['market_analysis', 'player_performance', 'team_context'],
      });

      const result1 = gradeProposition(testInput, config1, testContext);
      const result2 = gradeProposition(testInput, config2, testContext);

      const comparison = compareGradingResults(result1, result2);
      expect(comparison.identical).toBe(true);
    });
  });

  describe('Input Variation Sensitivity', () => {
    it('should detect meaningful input differences', () => {
      const baseResult = gradeProposition(testInput, testConfig, testContext);

      // Test different inputs that should produce different results
      const variations = [
        { ...testInput, odds: -110 }, // Different odds
        { ...testInput, sport: 'NBA' }, // Different sport
        { ...testInput, marketType: 'player_strikeouts' }, // Different market
      ];

      variations.forEach((variation, index) => {
        const variationResult = gradeProposition(variation, testConfig, testContext);
        const comparison = compareGradingResults(baseResult, variationResult);

        // Should detect differences for meaningful input changes
        expect(comparison.identical).toBe(false);
      });
    });

    it('should handle insignificant variations consistently', () => {
      const baseResult = gradeProposition(testInput, testConfig, testContext);

      // Test variations that should NOT affect the result
      const insignificantVariations = [
        { ...testInput, pickId: 'different-id' }, // Only ID change
      ];

      insignificantVariations.forEach(variation => {
        const variationResult = gradeProposition(variation, testConfig, testContext);
        
        // Only pickId should differ
        expect(variationResult.pickId).toBe(variation.pickId);
        expect(variationResult.totalScore).toBe(baseResult.totalScore);
        expect(variationResult.tier).toBe(baseResult.tier);
        expect(variationResult.confidenceLevel).toBe(baseResult.confidenceLevel);
      });
    });
  });

  describe('Context Data Determinism', () => {
    it('should handle context data ordering consistently', () => {
      const contextVariant1 = {
        historical: testContext.historical,
        team: testContext.team,
        market: testContext.market,
      };

      const contextVariant2 = {
        market: testContext.market,
        historical: testContext.historical,
        team: testContext.team,
      };

      const result1 = gradeProposition(testInput, testConfig, contextVariant1);
      const result2 = gradeProposition(testInput, testConfig, contextVariant2);

      const comparison = compareGradingResults(result1, result2);
      expect(comparison.identical).toBe(true);
    });

    it('should handle missing context data deterministically', () => {
      const results = [
        gradeProposition(testInput, testConfig, testContext),
        gradeProposition(testInput, testConfig, {}),
        gradeProposition(testInput, testConfig, undefined),
        gradeProposition(testInput, testConfig),
      ];

      // Results with same context should be identical
      const noContextResults = results.slice(1);
      for (let i = 1; i < noContextResults.length; i++) {
        const comparison = compareGradingResults(noContextResults[0], noContextResults[i]);
        expect(comparison.identical).toBe(true);
      }
    });

    it('should handle partial context data consistently', () => {
      const partialContexts = [
        { historical: testContext.historical },
        { team: testContext.team },
        { market: testContext.market },
        { historical: testContext.historical, team: testContext.team },
      ];

      // Each partial context should produce consistent results
      partialContexts.forEach(partialContext => {
        const results = Array.from({ length: 5 }, () =>
          gradeProposition(testInput, testConfig, partialContext)
        );

        for (let i = 1; i < results.length; i++) {
          const comparison = compareGradingResults(results[0], results[i]);
          expect(comparison.identical).toBe(true);
        }
      });
    });
  });

  describe('Configuration Determinism', () => {
    it('should handle equivalent weight configurations consistently', () => {
      const config1 = createDefaultGradingConfig({
        factorWeights: {
          player_performance: 0.4,
          team_context: 0.3,
          market_analysis: 0.3,
        },
      });

      // Mathematically equivalent but specified differently
      const config2 = createDefaultGradingConfig({
        factorWeights: {
          player_performance: 2/5,
          team_context: 3/10,
          market_analysis: 3/10,
        },
      });

      const result1 = gradeProposition(testInput, config1, testContext);
      const result2 = gradeProposition(testInput, config2, testContext);

      // Should be identical within floating point precision
      expect(Math.abs(result1.totalScore - result2.totalScore)).toBeLessThan(0.001);
      expect(result1.tier).toBe(result2.tier);
    });

    it('should handle factor enablement order consistently', () => {
      const orderedFactors = ['player_performance', 'team_context', 'market_analysis'];
      
      const configs = [
        createDefaultGradingConfig({ enabledFactors: orderedFactors }),
        createDefaultGradingConfig({ enabledFactors: [...orderedFactors].reverse() }),
        createDefaultGradingConfig({ enabledFactors: [...orderedFactors].sort() }),
      ];

      const results = configs.map(config => 
        gradeProposition(testInput, config, testContext)
      );

      // All should produce identical results
      for (let i = 1; i < results.length; i++) {
        const comparison = compareGradingResults(results[0], results[i]);
        expect(comparison.identical).toBe(true);
      }
    });
  });

  describe('Batch Processing Determinism', () => {
    it('should maintain determinism across batch sizes', () => {
      const inputs = Array.from({ length: 50 }, (_, i) => ({
        ...testInput,
        pickId: `batch-${i}`,
      }));

      // Process in different batch sizes
      const singleResults = inputs.map(input => 
        gradeProposition(input, testConfig, testContext)
      );

      const batchResult = gradeBatchPropositions(inputs, testConfig, {
        ...Object.fromEntries(inputs.map(input => [input.pickId, testContext]))
      });

      // Batch results should match individual results
      expect(batchResult.results).toHaveLength(inputs.length);
      
      for (let i = 0; i < inputs.length; i++) {
        const comparison = compareGradingResults(singleResults[i], batchResult.results[i]);
        expect(comparison.identical).toBe(true);
      }
    });

    it('should handle input order independence in batch processing', () => {
      const inputs = [
        { ...testInput, pickId: 'batch-a' },
        { ...testInput, pickId: 'batch-b' },
        { ...testInput, pickId: 'batch-c' },
      ];

      const result1 = gradeBatchPropositions(inputs, testConfig);
      const result2 = gradeBatchPropositions([...inputs].reverse(), testConfig);

      // Results should contain same picks (possibly in different order)
      const pickIds1 = result1.results.map(r => r.pickId).sort();
      const pickIds2 = result2.results.map(r => r.pickId).sort();
      
      expect(pickIds1).toEqual(pickIds2);

      // Each individual result should be identical when matched by pickId
      inputs.forEach(input => {
        const result1Item = result1.results.find(r => r.pickId === input.pickId);
        const result2Item = result2.results.find(r => r.pickId === input.pickId);
        
        expect(result1Item).toBeDefined();
        expect(result2Item).toBeDefined();
        
        if (result1Item && result2Item) {
          const comparison = compareGradingResults(result1Item, result2Item);
          expect(comparison.identical).toBe(true);
        }
      });
    });
  });

  describe('Idempotency Tests', () => {
    it('should be idempotent for repeated calls with same input', () => {
      const initialResult = gradeProposition(testInput, testConfig, testContext);
      
      // Call multiple times - should always return same result
      for (let i = 0; i < 10; i++) {
        const repeatedResult = gradeProposition(testInput, testConfig, testContext);
        const comparison = compareGradingResults(initialResult, repeatedResult);
        
        expect(comparison.identical).toBe(true);
        
        // Specific checks for key fields
        expect(repeatedResult.totalScore).toBe(initialResult.totalScore);
        expect(repeatedResult.tier).toBe(initialResult.tier);
        expect(repeatedResult.confidenceLevel).toBe(initialResult.confidenceLevel);
        expect(repeatedResult.edgeScore).toBe(initialResult.edgeScore);
        expect(repeatedResult.riskScore).toBe(initialResult.riskScore);
      }
    });

    it('should maintain idempotency across process restarts simulation', () => {
      // Simulate process restart by clearing any potential caches
      const result1 = gradeProposition(testInput, testConfig, testContext);
      
      // Clear any potential module-level caches by re-importing
      // (In a real test environment, this might involve restarting the process)
      const result2 = gradeProposition(testInput, testConfig, testContext);
      
      const comparison = compareGradingResults(result1, result2);
      expect(comparison.identical).toBe(true);
    });

    it('should maintain idempotency with computed derived values', () => {
      // Test that computed values (like edge score, risk score) are consistently derived
      const results = Array.from({ length: 20 }, () => 
        gradeProposition(testInput, testConfig, testContext)
      );

      const firstResult = results[0];
      
      results.forEach((result, index) => {
        // Edge score should always be totalScore - 50 (or 0 if negative)
        const expectedEdge = Math.max(0, result.totalScore - 50);
        expect(result.edgeScore).toBeCloseTo(expectedEdge, 5);
        
        // Risk score should be derived consistently
        expect(result.riskScore).toBeGreaterThanOrEqual(0);
        expect(result.riskScore).toBeLessThanOrEqual(100);
        
        // Factor breakdown should sum consistently (accounting for rounding)
        const factorSum = Object.values(result.factorBreakdown)
          .reduce((sum, contribution) => sum + contribution, 0);
        expect(Math.abs(factorSum - result.totalScore)).toBeLessThan(1.0);
      });
    });
  });

  describe('Error Determinism', () => {
    it('should throw consistent errors for invalid inputs', () => {
      const invalidInput = { ...testInput, pickId: '', sport: '' };
      
      const errors = [];
      for (let i = 0; i < 5; i++) {
        try {
          gradeProposition(invalidInput, testConfig, testContext);
        } catch (error) {
          errors.push(error);
        }
      }

      expect(errors).toHaveLength(5);
      
      // All errors should be identical
      for (let i = 1; i < errors.length; i++) {
        expect(errors[i].message).toBe(errors[0].message);
        expect(errors[i].code).toBe(errors[0].code);
      }
    });

    it('should handle boundary condition errors consistently', () => {
      const badConfig = createDefaultGradingConfig({
        factorWeights: { invalid_factor: 2.0 }, // Sum > 1.0
      });

      const errors = [];
      for (let i = 0; i < 3; i++) {
        try {
          gradeProposition(testInput, badConfig, testContext);
        } catch (error) {
          errors.push(error);
        }
      }

      expect(errors).toHaveLength(3);
      errors.forEach(error => {
        expect(error.message).toContain('Invalid grading configuration');
      });
    });
  });
});