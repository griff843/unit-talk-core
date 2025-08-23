/**
 * Pure ML Model Calculators - No I/O Operations
 * Contains mathematical algorithms for machine learning predictions
 */

export interface MLFeatureSet {
  playerStats?: Record<string, number>;
  teamStats?: Record<string, number>;
  marketData?: Record<string, number>;
  historicalPerformance?: number[];
  contextualFactors?: Record<string, number>;
}

export interface MLPrediction {
  score: number;
  confidence: number;
  features: string[];
  modelType: string;
  version: string;
}

/**
 * Ensemble prediction calculator
 * Combines multiple model predictions using weighted averaging
 */
export class EnsembleCalculator {
  /**
   * Calculate ensemble prediction from multiple models
   */
  static calculateEnsemblePrediction(
    predictions: Array<{ score: number; confidence: number; weight: number }>,
    method:
      | 'weighted_average'
      | 'confidence_weighted'
      | 'stacked' = 'weighted_average'
  ): { score: number; confidence: number } {
    if (predictions.length === 0) {
      return { score: 50, confidence: 0.1 };
    }

    switch (method) {
      case 'weighted_average':
        return this.weightedAverage(predictions);
      case 'confidence_weighted':
        return this.confidenceWeightedAverage(predictions);
      case 'stacked':
        return this.stackedEnsemble(predictions);
      default:
        return this.weightedAverage(predictions);
    }
  }

  private static weightedAverage(
    predictions: Array<{ score: number; confidence: number; weight: number }>
  ): { score: number; confidence: number } {
    const totalWeight = predictions.reduce((sum, p) => sum + p.weight, 0);
    if (totalWeight === 0) return { score: 50, confidence: 0.1 };

    const weightedScore =
      predictions.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight;
    const avgConfidence =
      predictions.reduce((sum, p) => sum + p.confidence, 0) /
      predictions.length;

    return {
      score: Math.max(0, Math.min(100, weightedScore)),
      confidence: Math.max(0, Math.min(1, avgConfidence)),
    };
  }

  private static confidenceWeightedAverage(
    predictions: Array<{ score: number; confidence: number; weight: number }>
  ): { score: number; confidence: number } {
    const totalConfidence = predictions.reduce(
      (sum, p) => sum + p.confidence,
      0
    );
    if (totalConfidence === 0) return { score: 50, confidence: 0.1 };

    const confidenceWeightedScore =
      predictions.reduce((sum, p) => sum + p.score * p.confidence, 0) /
      totalConfidence;

    const avgConfidence =
      predictions.reduce((sum, p) => sum + p.confidence, 0) /
      predictions.length;

    return {
      score: Math.max(0, Math.min(100, confidenceWeightedScore)),
      confidence: Math.max(0, Math.min(1, avgConfidence)),
    };
  }

  private static stackedEnsemble(
    predictions: Array<{ score: number; confidence: number; weight: number }>
  ): { score: number; confidence: number } {
    // Simple stacking: use linear combination with meta-learner weights
    const metaWeights = this.calculateMetaWeights(predictions);
    const stackedScore = predictions.reduce(
      (sum, p, i) => sum + p.score * metaWeights[i],
      0
    );

    const avgConfidence =
      predictions.reduce((sum, p) => sum + p.confidence, 0) /
      predictions.length;

    return {
      score: Math.max(0, Math.min(100, stackedScore)),
      confidence: Math.max(0, Math.min(1, avgConfidence * 1.1)), // Slight confidence boost for stacking
    };
  }

  private static calculateMetaWeights(
    predictions: Array<{ score: number; confidence: number; weight: number }>
  ): number[] {
    // Simple meta-learning: weight by confidence and base weight
    const totalWeight = predictions.reduce(
      (sum, p) => sum + p.confidence * p.weight,
      0
    );
    return predictions.map(p => (p.confidence * p.weight) / totalWeight);
  }
}

/**
 * Gradient Boosting Calculator
 * Simulates gradient boosting predictions using feature importance
 */
export class GradientBoostingCalculator {
  /**
   * Calculate gradient boosting prediction
   */
  static calculatePrediction(
    features: MLFeatureSet,
    treeDepth: number = 6,
    nEstimators: number = 100,
    learningRate: number = 0.1
  ): MLPrediction {
    const featureVector = this.extractFeatureVector(features);
    const featureImportance = this.calculateFeatureImportance(featureVector);

    // Simulate gradient boosting iterations
    let prediction = 0.5; // Initial prediction

    for (let i = 0; i < nEstimators; i++) {
      const treePrediction = this.simulateDecisionTree(
        featureVector,
        featureImportance,
        treeDepth
      );
      prediction += learningRate * treePrediction;
    }

    // Convert to 0-100 scale
    const score = Math.max(0, Math.min(100, prediction * 100));
    const confidence = this.calculateConfidence(
      featureVector,
      featureImportance
    );

    return {
      score,
      confidence,
      features: Object.keys(featureVector),
      modelType: 'gradient_boosting',
      version: '1.0.0',
    };
  }

  private static extractFeatureVector(
    features: MLFeatureSet
  ): Record<string, number> {
    const vector: Record<string, number> = {};

    // Extract player stats
    if (features.playerStats) {
      Object.entries(features.playerStats).forEach(([key, value]) => {
        vector[`player_${key}`] = this.normalizeFeature(value);
      });
    }

    // Extract team stats
    if (features.teamStats) {
      Object.entries(features.teamStats).forEach(([key, value]) => {
        vector[`team_${key}`] = this.normalizeFeature(value);
      });
    }

    // Extract market data
    if (features.marketData) {
      Object.entries(features.marketData).forEach(([key, value]) => {
        vector[`market_${key}`] = this.normalizeFeature(value);
      });
    }

    // Extract historical performance features
    if (
      features.historicalPerformance &&
      features.historicalPerformance.length > 0
    ) {
      const hist = features.historicalPerformance;
      vector['hist_mean'] = hist.reduce((a, b) => a + b, 0) / hist.length;
      vector['hist_trend'] = this.calculateTrend(hist);
      vector['hist_volatility'] = this.calculateVolatility(hist);
    }

    return vector;
  }

  private static normalizeFeature(value: number): number {
    // Simple min-max normalization to [0, 1]
    return Math.max(0, Math.min(1, value / 100));
  }

  private static calculateFeatureImportance(
    featureVector: Record<string, number>
  ): Record<string, number> {
    const importance: Record<string, number> = {};
    const features = Object.keys(featureVector);

    // Simple importance calculation based on feature variance and correlation
    features.forEach(feature => {
      const value = featureVector[feature];
      // Higher variance from 0.5 means higher importance
      importance[feature] = Math.abs(value - 0.5) * 2;
    });

    // Normalize importance scores
    const totalImportance = Object.values(importance).reduce(
      (a, b) => a + b,
      0
    );
    if (totalImportance > 0) {
      Object.keys(importance).forEach(feature => {
        importance[feature] = importance[feature] / totalImportance;
      });
    }

    return importance;
  }

  private static simulateDecisionTree(
    featureVector: Record<string, number>,
    featureImportance: Record<string, number>,
    depth: number
  ): number {
    // Simple decision tree simulation
    let prediction = 0;
    const features = Object.keys(featureVector);

    for (let d = 0; d < depth; d++) {
      // Select most important feature for this level
      const selectedFeature = features.reduce((best, feature) => {
        return featureImportance[feature] > featureImportance[best]
          ? feature
          : best;
      });

      const featureValue = featureVector[selectedFeature];
      const threshold = 0.5; // Simple threshold

      if (featureValue > threshold) {
        prediction += (0.1 * (depth - d)) / depth; // Weight by tree depth
      } else {
        prediction -= (0.1 * (depth - d)) / depth;
      }
    }

    return prediction;
  }

  private static calculateConfidence(
    featureVector: Record<string, number>,
    featureImportance: Record<string, number>
  ): number {
    // Confidence based on feature quality and importance
    const features = Object.keys(featureVector);
    if (features.length === 0) return 0.1;

    const avgImportance =
      Object.values(featureImportance).reduce((a, b) => a + b, 0) /
      features.length;
    const featureQuality =
      features.reduce((sum, feature) => {
        return sum + (featureVector[feature] > 0 ? 1 : 0);
      }, 0) / features.length;

    return Math.max(0.1, Math.min(0.9, (avgImportance + featureQuality) / 2));
  }

  private static calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  private static calculateVolatility(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(variance);
  }
}

/**
 * Neural Network Calculator
 * Simulates simple neural network predictions
 */
export class NeuralNetworkCalculator {
  /**
   * Calculate neural network prediction using simple feedforward
   */
  static calculatePrediction(
    features: MLFeatureSet,
    hiddenLayers: number[] = [10, 5],
    activationFunction: 'sigmoid' | 'relu' | 'tanh' = 'relu'
  ): MLPrediction {
    const featureVector = this.extractFeatureArray(features);
    if (featureVector.length === 0) {
      return {
        score: 50,
        confidence: 0.1,
        features: [],
        modelType: 'neural_network',
        version: '1.0.0',
      };
    }

    // Initialize weights (simplified)
    const weights = this.initializeWeights(featureVector.length, hiddenLayers);

    // Forward pass
    const output = this.forwardPass(
      featureVector,
      weights,
      hiddenLayers,
      activationFunction
    );

    // Convert to 0-100 scale
    const score = Math.max(0, Math.min(100, output * 100));
    const confidence = this.calculateNeuralConfidence(featureVector, output);

    return {
      score,
      confidence,
      features: this.getFeatureNames(features),
      modelType: 'neural_network',
      version: '1.0.0',
    };
  }

  private static extractFeatureArray(features: MLFeatureSet): number[] {
    const arr: number[] = [];

    // Add player stats
    if (features.playerStats) {
      arr.push(...Object.values(features.playerStats).map(v => v / 100));
    }

    // Add team stats
    if (features.teamStats) {
      arr.push(...Object.values(features.teamStats).map(v => v / 100));
    }

    // Add market data
    if (features.marketData) {
      arr.push(...Object.values(features.marketData));
    }

    // Add historical performance metrics
    if (
      features.historicalPerformance &&
      features.historicalPerformance.length > 0
    ) {
      const hist = features.historicalPerformance;
      arr.push(hist.reduce((a, b) => a + b, 0) / hist.length / 100); // Mean
      arr.push(this.calculateTrend(hist)); // Trend
    }

    return arr;
  }

  private static initializeWeights(
    inputSize: number,
    hiddenLayers: number[]
  ): number[][][] {
    const weights: number[][][] = [];
    let currentSize = inputSize;

    // Initialize weights for each layer
    for (const layerSize of hiddenLayers) {
      const layerWeights: number[][] = [];
      for (let i = 0; i < layerSize; i++) {
        const neuronWeights: number[] = [];
        for (let j = 0; j < currentSize; j++) {
          // Xavier initialization
          neuronWeights.push(
            (Math.random() - 0.5) * 2 * Math.sqrt(6 / (currentSize + layerSize))
          );
        }
        layerWeights.push(neuronWeights);
      }
      weights.push(layerWeights);
      currentSize = layerSize;
    }

    // Output layer (single neuron)
    const outputWeights: number[][] = [[]];
    for (let i = 0; i < currentSize; i++) {
      outputWeights[0].push(
        (Math.random() - 0.5) * 2 * Math.sqrt(6 / (currentSize + 1))
      );
    }
    weights.push(outputWeights);

    return weights;
  }

  private static forwardPass(
    input: number[],
    weights: number[][][],
    hiddenLayers: number[],
    activationFunction: string
  ): number {
    let currentInput = input;

    // Pass through each layer
    for (let layerIndex = 0; layerIndex < weights.length; layerIndex++) {
      const layerWeights = weights[layerIndex];
      const layerOutput: number[] = [];

      for (const neuronWeights of layerWeights) {
        // Calculate weighted sum
        let sum = 0;
        for (let i = 0; i < currentInput.length; i++) {
          sum += currentInput[i] * neuronWeights[i];
        }

        // Apply activation function
        let activated: number;
        switch (activationFunction) {
          case 'sigmoid':
            activated = 1 / (1 + Math.exp(-sum));
            break;
          case 'tanh':
            activated = Math.tanh(sum);
            break;
          case 'relu':
          default:
            activated = Math.max(0, sum);
            break;
        }

        layerOutput.push(activated);
      }

      currentInput = layerOutput;
    }

    // Return final output (single value)
    return currentInput[0];
  }

  private static calculateNeuralConfidence(
    input: number[],
    output: number
  ): number {
    // Confidence based on input quality and output certainty
    const inputQuality =
      input.reduce((sum, val) => sum + (val > 0 ? 1 : 0), 0) / input.length;
    const outputCertainty = Math.abs(output - 0.5) * 2; // Distance from neutral

    return Math.max(0.1, Math.min(0.9, (inputQuality + outputCertainty) / 2));
  }

  private static getFeatureNames(features: MLFeatureSet): string[] {
    const names: string[] = [];

    if (features.playerStats) {
      names.push(...Object.keys(features.playerStats).map(k => `player_${k}`));
    }
    if (features.teamStats) {
      names.push(...Object.keys(features.teamStats).map(k => `team_${k}`));
    }
    if (features.marketData) {
      names.push(...Object.keys(features.marketData).map(k => `market_${k}`));
    }
    if (features.historicalPerformance) {
      names.push('hist_mean', 'hist_trend');
    }

    return names;
  }

  private static calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }
}

/**
 * Random Forest Calculator
 * Simulates random forest predictions using ensemble of decision trees
 */
export class RandomForestCalculator {
  /**
   * Calculate random forest prediction
   */
  static calculatePrediction(
    features: MLFeatureSet,
    nTrees: number = 100,
    maxDepth: number = 10,
    featureSubsetRatio: number = 0.7
  ): MLPrediction {
    const featureVector = this.extractFeatureVector(features);
    const featureNames = Object.keys(featureVector);

    if (featureNames.length === 0) {
      return {
        score: 50,
        confidence: 0.1,
        features: [],
        modelType: 'random_forest',
        version: '1.0.0',
      };
    }

    const treePredictions: number[] = [];

    // Generate predictions from multiple trees
    for (let i = 0; i < nTrees; i++) {
      const treePrediction = this.simulateRandomTree(
        featureVector,
        featureNames,
        maxDepth,
        featureSubsetRatio,
        i // Use as random seed
      );
      treePredictions.push(treePrediction);
    }

    // Average predictions
    const avgPrediction =
      treePredictions.reduce((a, b) => a + b, 0) / treePredictions.length;
    const score = Math.max(0, Math.min(100, avgPrediction * 100));

    // Calculate confidence based on prediction variance
    const variance =
      treePredictions.reduce(
        (sum, pred) => sum + Math.pow(pred - avgPrediction, 2),
        0
      ) / treePredictions.length;
    const confidence = Math.max(0.1, Math.min(0.9, 1 - Math.sqrt(variance)));

    return {
      score,
      confidence,
      features: featureNames,
      modelType: 'random_forest',
      version: '1.0.0',
    };
  }

  private static extractFeatureVector(
    features: MLFeatureSet
  ): Record<string, number> {
    const vector: Record<string, number> = {};

    if (features.playerStats) {
      Object.entries(features.playerStats).forEach(([key, value]) => {
        vector[`player_${key}`] = value / 100;
      });
    }

    if (features.teamStats) {
      Object.entries(features.teamStats).forEach(([key, value]) => {
        vector[`team_${key}`] = value / 100;
      });
    }

    if (features.marketData) {
      Object.entries(features.marketData).forEach(([key, value]) => {
        vector[`market_${key}`] = value;
      });
    }

    return vector;
  }

  private static simulateRandomTree(
    featureVector: Record<string, number>,
    featureNames: string[],
    maxDepth: number,
    featureSubsetRatio: number,
    seed: number
  ): number {
    // Select random subset of features
    const subsetSize = Math.floor(featureNames.length * featureSubsetRatio);
    const selectedFeatures = this.selectRandomFeatures(
      featureNames,
      subsetSize,
      seed
    );

    // Build tree prediction
    return this.buildTreePrediction(
      featureVector,
      selectedFeatures,
      maxDepth,
      seed
    );
  }

  private static selectRandomFeatures(
    featureNames: string[],
    subsetSize: number,
    seed: number
  ): string[] {
    // Simple deterministic "random" selection based on seed
    const selected: string[] = [];
    for (let i = 0; i < subsetSize && i < featureNames.length; i++) {
      const index = (seed + i * 17) % featureNames.length;
      if (!selected.includes(featureNames[index])) {
        selected.push(featureNames[index]);
      }
    }
    return selected;
  }

  private static buildTreePrediction(
    featureVector: Record<string, number>,
    selectedFeatures: string[],
    maxDepth: number,
    seed: number
  ): number {
    let prediction = 0.5; // Start neutral

    for (let depth = 0; depth < maxDepth; depth++) {
      if (selectedFeatures.length === 0) break;

      // Select feature for this split
      const featureIndex = (seed + depth * 13) % selectedFeatures.length;
      const feature = selectedFeatures[featureIndex];
      const featureValue = featureVector[feature] || 0.5;

      // Simple threshold split
      const threshold = 0.5;
      const adjustment = (0.1 * (maxDepth - depth)) / maxDepth;

      if (featureValue > threshold) {
        prediction += adjustment;
      } else {
        prediction -= adjustment;
      }
    }

    return Math.max(0, Math.min(1, prediction));
  }
}
