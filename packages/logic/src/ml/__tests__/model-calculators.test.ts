/**
 * Unit tests for ML Model Calculators
 * Tests pure mathematical ML algorithms with no I/O
 */

import {
  EnsembleCalculator,
  GradientBoostingCalculator,
  NeuralNetworkCalculator,
  RandomForestCalculator,
  type MLFeatureSet,
  type MLPrediction,
} from '../model-calculators.js';

describe('EnsembleCalculator', () => {
  describe('calculateEnsemblePrediction', () => {
    it('should calculate weighted average correctly', () => {
      const predictions = [
        { score: 80, confidence: 0.9, weight: 0.5 },
        { score: 60, confidence: 0.8, weight: 0.3 },
        { score: 40, confidence: 0.7, weight: 0.2 },
      ];

      const result = EnsembleCalculator.calculateEnsemblePrediction(predictions, 'weighted_average');

      const expectedScore = (80 * 0.5 + 60 * 0.3 + 40 * 0.2) / (0.5 + 0.3 + 0.2);
      const expectedConfidence = (0.9 + 0.8 + 0.7) / 3;

      expect(result.score).toBeCloseTo(expectedScore, 1);
      expect(result.confidence).toBeCloseTo(expectedConfidence, 2);
    });

    it('should calculate confidence weighted average', () => {
      const predictions = [
        { score: 80, confidence: 0.9, weight: 0.5 },
        { score: 60, confidence: 0.1, weight: 0.5 }, // Low confidence
      ];

      const result = EnsembleCalculator.calculateEnsemblePrediction(predictions, 'confidence_weighted');

      // Should be heavily weighted toward the high-confidence prediction
      expect(result.score).toBeCloseTo(78, 0);
    });

    it('should calculate stacked ensemble', () => {
      const predictions = [
        { score: 80, confidence: 0.9, weight: 0.6 },
        { score: 60, confidence: 0.8, weight: 0.4 },
      ];

      const result = EnsembleCalculator.calculateEnsemblePrediction(predictions, 'stacked');

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
      expect(result.confidence).toBeGreaterThan(0.8); // Stacking boosts confidence
    });

    it('should handle empty predictions', () => {
      const result = EnsembleCalculator.calculateEnsemblePrediction([], 'weighted_average');

      expect(result.score).toBe(50);
      expect(result.confidence).toBe(0.1);
    });

    it('should handle zero weights', () => {
      const predictions = [
        { score: 80, confidence: 0.9, weight: 0 },
        { score: 60, confidence: 0.8, weight: 0 },
      ];

      const result = EnsembleCalculator.calculateEnsemblePrediction(predictions, 'weighted_average');

      expect(result.score).toBe(50);
      expect(result.confidence).toBe(0.1);
    });
  });
});

describe('GradientBoostingCalculator', () => {
  let mockFeatures: MLFeatureSet;

  beforeEach(() => {
    mockFeatures = {
      playerStats: {
        points: 25.5,
        rebounds: 8.2,
        assists: 6.1,
        fieldGoalPct: 0.485,
      },
      teamStats: {
        offensiveRating: 112.5,
        defensiveRating: 108.2,
        pace: 102.1,
      },
      marketData: {
        odds: -110,
        volume: 5000,
        sharpMoney: 0.3,
      },
      historicalPerformance: [22, 28, 19, 31, 26, 24, 30],
      contextualFactors: {
        homeAdvantage: 0.6,
        restDays: 2,
        opponent_strength: 0.7,
      },
    };
  });

  describe('calculatePrediction', () => {
    it('should generate a valid prediction', () => {
      const result = GradientBoostingCalculator.calculatePrediction(mockFeatures);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.modelType).toBe('gradient_boosting');
      expect(result.version).toBe('1.0.0');
      expect(result.features.length).toBeGreaterThan(0);
    });

    it('should be deterministic with same inputs', () => {
      const result1 = GradientBoostingCalculator.calculatePrediction(mockFeatures);
      const result2 = GradientBoostingCalculator.calculatePrediction(mockFeatures);

      expect(result1.score).toBe(result2.score);
      expect(result1.confidence).toBe(result2.confidence);
    });

    it('should handle different tree parameters', () => {
      const result1 = GradientBoostingCalculator.calculatePrediction(mockFeatures, 3, 50, 0.2);
      const result2 = GradientBoostingCalculator.calculatePrediction(mockFeatures, 8, 200, 0.05);

      // Should produce different results with different parameters
      expect(result1.score).not.toBe(result2.score);
    });

    it('should handle empty features gracefully', () => {
      const emptyFeatures: MLFeatureSet = {};
      const result = GradientBoostingCalculator.calculatePrediction(emptyFeatures);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBe(0.1); // Low confidence for no features
    });
  });
});

describe('NeuralNetworkCalculator', () => {
  let mockFeatures: MLFeatureSet;

  beforeEach(() => {
    mockFeatures = {
      playerStats: {
        points: 22.3,
        rebounds: 5.7,
        assists: 8.9,
      },
      teamStats: {
        winRate: 0.65,
        offensiveRating: 115.2,
      },
      marketData: {
        impliedProbability: 0.52,
      },
      historicalPerformance: [20, 25, 18, 27, 23],
    };
  });

  describe('calculatePrediction', () => {
    it('should generate a valid neural network prediction', () => {
      const result = NeuralNetworkCalculator.calculatePrediction(mockFeatures);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.modelType).toBe('neural_network');
      expect(result.features).toContain('player_points');
      expect(result.features).toContain('team_winRate');
    });

    it('should handle different network architectures', () => {
      const result1 = NeuralNetworkCalculator.calculatePrediction(mockFeatures, [5], 'sigmoid');
      const result2 = NeuralNetworkCalculator.calculatePrediction(mockFeatures, [10, 5, 3], 'relu');

      // Different architectures should produce different results
      expect(result1.score).not.toBe(result2.score);
      expect(result1.confidence).not.toBe(result2.confidence);
    });

    it('should handle different activation functions', () => {
      const sigmoidResult = NeuralNetworkCalculator.calculatePrediction(mockFeatures, [5], 'sigmoid');
      const reluResult = NeuralNetworkCalculator.calculatePrediction(mockFeatures, [5], 'relu');
      const tanhResult = NeuralNetworkCalculator.calculatePrediction(mockFeatures, [5], 'tanh');

      expect(sigmoidResult.score).not.toBe(reluResult.score);
      expect(reluResult.score).not.toBe(tanhResult.score);
    });

    it('should handle empty features', () => {
      const result = NeuralNetworkCalculator.calculatePrediction({});

      expect(result.score).toBe(50);
      expect(result.confidence).toBe(0.1);
      expect(result.features).toHaveLength(0);
    });

    it('should be deterministic', () => {
      const result1 = NeuralNetworkCalculator.calculatePrediction(mockFeatures);
      const result2 = NeuralNetworkCalculator.calculatePrediction(mockFeatures);

      expect(result1.score).toBe(result2.score);
      expect(result1.confidence).toBe(result2.confidence);
    });
  });
});

describe('RandomForestCalculator', () => {
  let mockFeatures: MLFeatureSet;

  beforeEach(() => {
    mockFeatures = {
      playerStats: {
        points: 18.7,
        rebounds: 9.2,
        assists: 4.1,
        steals: 1.3,
        blocks: 0.8,
      },
      teamStats: {
        pace: 98.5,
        effectiveFieldGoalPct: 0.535,
      },
      marketData: {
        lineMovement: 1.5,
        publicBetting: 0.68,
      },
      contextualFactors: {
        temperature: 72,
        windSpeed: 8,
      },
    };
  });

  describe('calculatePrediction', () => {
    it('should generate a valid random forest prediction', () => {
      const result = RandomForestCalculator.calculatePrediction(mockFeatures);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.modelType).toBe('random_forest');
      expect(result.features).toContain('player_points');
      expect(result.features).toContain('team_pace');
    });

    it('should handle different forest parameters', () => {
      const result1 = RandomForestCalculator.calculatePrediction(mockFeatures, 50, 5, 0.5);
      const result2 = RandomForestCalculator.calculatePrediction(mockFeatures, 200, 15, 0.8);

      // Different parameters should affect results
      expect(result1.score).not.toBe(result2.score);
    });

    it('should show appropriate confidence based on prediction variance', () => {
      const result = RandomForestCalculator.calculatePrediction(mockFeatures, 10, 3, 0.5);

      // With fewer trees, should have more variance and potentially lower confidence
      expect(result.confidence).toBeGreaterThan(0.1);
    });

    it('should handle empty features', () => {
      const result = RandomForestCalculator.calculatePrediction({});

      expect(result.score).toBe(50); // Neutral
      expect(result.confidence).toBe(0.1); // Low confidence
      expect(result.features).toHaveLength(0);
    });

    it('should be deterministic with same parameters', () => {
      const result1 = RandomForestCalculator.calculatePrediction(mockFeatures, 50, 10, 0.7);
      const result2 = RandomForestCalculator.calculatePrediction(mockFeatures, 50, 10, 0.7);

      expect(result1.score).toBe(result2.score);
      expect(result1.confidence).toBe(result2.confidence);
    });

    it('should utilize feature subset ratio correctly', () => {
      const fullFeatures = RandomForestCalculator.calculatePrediction(mockFeatures, 10, 5, 1.0);
      const subsetFeatures = RandomForestCalculator.calculatePrediction(mockFeatures, 10, 5, 0.5);

      // Should produce different results when using different feature subsets
      expect(fullFeatures.score).not.toBe(subsetFeatures.score);
    });
  });
});

describe('Integration Tests', () => {
  let mockFeatures: MLFeatureSet;

  beforeEach(() => {
    mockFeatures = {
      playerStats: {
        points: 25.8,
        rebounds: 7.3,
        assists: 5.9,
        fieldGoalPct: 0.472,
        threePointPct: 0.381,
      },
      teamStats: {
        offensiveRating: 114.2,
        defensiveRating: 109.8,
        pace: 101.5,
        winRate: 0.58,
      },
      marketData: {
        odds: -115,
        volume: 8500,
        impliedProbability: 0.535,
        lineMovement: 0.5,
      },
      historicalPerformance: [23, 28, 21, 30, 25, 22, 29, 26, 24, 27],
      contextualFactors: {
        homeAdvantage: 0.7,
        restDays: 1,
        opponentStrength: 0.65,
        weatherFactor: 1.0,
      },
    };
  });

  describe('Model Comparison', () => {
    it('should produce different predictions from different models', () => {
      const gbResult = GradientBoostingCalculator.calculatePrediction(mockFeatures);
      const nnResult = NeuralNetworkCalculator.calculatePrediction(mockFeatures);
      const rfResult = RandomForestCalculator.calculatePrediction(mockFeatures);

      // Models should produce different results
      expect(gbResult.score).not.toBe(nnResult.score);
      expect(nnResult.score).not.toBe(rfResult.score);
      expect(gbResult.score).not.toBe(rfResult.score);

      // All should be valid predictions
      [gbResult, nnResult, rfResult].forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should work well with ensemble methods', () => {
      const gbResult = GradientBoostingCalculator.calculatePrediction(mockFeatures);
      const nnResult = NeuralNetworkCalculator.calculatePrediction(mockFeatures);
      const rfResult = RandomForestCalculator.calculatePrediction(mockFeatures);

      const predictions = [
        { score: gbResult.score, confidence: gbResult.confidence, weight: 0.4 },
        { score: nnResult.score, confidence: nnResult.confidence, weight: 0.3 },
        { score: rfResult.score, confidence: rfResult.confidence, weight: 0.3 },
      ];

      const ensembleResult = EnsembleCalculator.calculateEnsemblePrediction(predictions);

      expect(ensembleResult.score).toBeGreaterThanOrEqual(0);
      expect(ensembleResult.score).toBeLessThanOrEqual(100);
      expect(ensembleResult.confidence).toBeGreaterThan(0);

      // Ensemble score should be between the individual model scores
      const scores = [gbResult.score, nnResult.score, rfResult.score].sort((a, b) => a - b);
      expect(ensembleResult.score).toBeGreaterThanOrEqual(scores[0] - 5); // Allow some tolerance
      expect(ensembleResult.score).toBeLessThanOrEqual(scores[2] + 5);
    });
  });

  describe('Feature Sensitivity', () => {
    it('should be sensitive to significant feature changes', () => {
      const baseline = GradientBoostingCalculator.calculatePrediction(mockFeatures);

      // Change player performance significantly
      const modifiedFeatures = {
        ...mockFeatures,
        playerStats: {
          ...mockFeatures.playerStats!,
          points: 35.0, // Much higher
          fieldGoalPct: 0.600, // Much better
        },
      };

      const modified = GradientBoostingCalculator.calculatePrediction(modifiedFeatures);

      // Should produce noticeably different result
      expect(Math.abs(baseline.score - modified.score)).toBeGreaterThan(5);
    });

    it('should be relatively stable for small changes', () => {
      const baseline = RandomForestCalculator.calculatePrediction(mockFeatures);

      // Make small changes
      const slightlyModified = {
        ...mockFeatures,
        playerStats: {
          ...mockFeatures.playerStats!,
          points: (mockFeatures.playerStats!.points as number) + 0.5,
        },
      };

      const modified = RandomForestCalculator.calculatePrediction(slightlyModified);

      // Should be relatively stable
      expect(Math.abs(baseline.score - modified.score)).toBeLessThan(10);
    });
  });
});