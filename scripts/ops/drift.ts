#!/usr/bin/env node

/**
 * Feature/Label Drift Detection System
 * 
 * Implements KS (Kolmogorov-Smirnov) and PSI (Population Stability Index) statistical tests
 * to detect distribution drift in raw_props feature patterns vs 30-day rolling baseline.
 * 
 * Key Features:
 * - Multi-dimensional feature analysis
 * - Configurable WARN/ALERT thresholds
 * - Time-series drift trending
 * - JSON output for dashboard integration
 * 
 * Statistical Methods:
 * - KS Test: Distribution drift detection (non-parametric)
 * - PSI: Population stability monitoring  
 * - Rolling baseline: 30-day sliding window
 * - Feature extraction: JSON path analysis
 */

import '../shared/bootstrapEnv';
import { getPgPool } from '../shared/db';
import { logger } from '@unit-talk/observability';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Environment loaded via import

/**
 * Statistical Functions for Drift Detection
 */

/**
 * Kolmogorov-Smirnov Test Implementation
 * Tests null hypothesis that two samples come from the same distribution
 * Returns D-statistic and p-value for distribution comparison
 */
export function kolmogorovSmirnovTest(sample1: number[], sample2: number[]): {
  dStatistic: number;
  pValue: number;
  significant: boolean;
} {
  if (sample1.length === 0 || sample2.length === 0) {
    return { dStatistic: 0, pValue: 1, significant: false };
  }

  // Sort samples
  const sorted1 = [...sample1].sort((a, b) => a - b);
  const sorted2 = [...sample2].sort((a, b) => a - b);
  
  const n1 = sorted1.length;
  const n2 = sorted2.length;
  
  // Create combined sorted array with source tracking
  const combined: { value: number; source: number }[] = [];
  sorted1.forEach(v => combined.push({ value: v, source: 1 }));
  sorted2.forEach(v => combined.push({ value: v, source: 2 }));
  combined.sort((a, b) => a.value - b.value);
  
  let maxDiff = 0;
  let cdf1 = 0;
  let cdf2 = 0;
  
  // Calculate empirical CDFs and find maximum difference
  for (const item of combined) {
    if (item.source === 1) {
      cdf1 += 1 / n1;
    } else {
      cdf2 += 1 / n2;
    }
    
    const diff = Math.abs(cdf1 - cdf2);
    if (diff > maxDiff) {
      maxDiff = diff;
    }
  }
  
  // Calculate approximate p-value using asymptotic distribution
  const c = Math.sqrt((-0.5) * Math.log(0.05 / 2)); // For α = 0.05
  const criticalValue = c * Math.sqrt((n1 + n2) / (n1 * n2));
  
  // Asymptotic p-value approximation (simplified)
  const standardizedD = maxDiff * Math.sqrt((n1 * n2) / (n1 + n2));
  const pValue = 2 * Math.exp(-2 * standardizedD * standardizedD);
  
  return {
    dStatistic: maxDiff,
    pValue: Math.max(0, Math.min(1, pValue)),
    significant: maxDiff > criticalValue
  };
}

/**
 * Population Stability Index (PSI) Calculation
 * Measures population stability between baseline and current distributions
 * PSI = Σ (Actual% - Expected%) * ln(Actual% / Expected%)
 */
export function calculatePSI(baseline: number[], current: number[], bins: number = 10): {
  psiScore: number;
  binAnalysis: Array<{
    binRange: string;
    baselinePercent: number;
    currentPercent: number;
    contribution: number;
  }>;
  interpretation: 'stable' | 'minor_shift' | 'major_shift';
} {
  if (baseline.length === 0 || current.length === 0) {
    return {
      psiScore: 0,
      binAnalysis: [],
      interpretation: 'stable'
    };
  }

  // Determine bin boundaries based on baseline distribution
  const sortedBaseline = [...baseline].sort((a, b) => a - b);
  const min = sortedBaseline[0];
  const max = sortedBaseline[sortedBaseline.length - 1];
  
  if (min === max) {
    return {
      psiScore: 0,
      binAnalysis: [],
      interpretation: 'stable'
    };
  }

  const binWidth = (max - min) / bins;
  const binBoundaries: number[] = [];
  for (let i = 0; i <= bins; i++) {
    binBoundaries.push(min + i * binWidth);
  }

  // Count observations in each bin for both distributions
  const baselineCounts = new Array(bins).fill(0);
  const currentCounts = new Array(bins).fill(0);

  // Bin baseline data
  for (const value of baseline) {
    let binIndex = Math.floor((value - min) / binWidth);
    binIndex = Math.max(0, Math.min(bins - 1, binIndex));
    baselineCounts[binIndex]++;
  }

  // Bin current data
  for (const value of current) {
    let binIndex = Math.floor((value - min) / binWidth);
    binIndex = Math.max(0, Math.min(bins - 1, binIndex));
    currentCounts[binIndex]++;
  }

  // Calculate PSI
  let psiScore = 0;
  const binAnalysis: Array<{
    binRange: string;
    baselinePercent: number;
    currentPercent: number;
    contribution: number;
  }> = [];

  for (let i = 0; i < bins; i++) {
    const baselinePercent = (baselineCounts[i] / baseline.length) || 0.0001; // Avoid division by zero
    const currentPercent = (currentCounts[i] / current.length) || 0.0001;
    
    const contribution = (currentPercent - baselinePercent) * Math.log(currentPercent / baselinePercent);
    psiScore += contribution;

    binAnalysis.push({
      binRange: `${binBoundaries[i].toFixed(3)} - ${binBoundaries[i + 1].toFixed(3)}`,
      baselinePercent: baselinePercent * 100,
      currentPercent: currentPercent * 100,
      contribution
    });
  }

  // PSI interpretation thresholds
  let interpretation: 'stable' | 'minor_shift' | 'major_shift';
  if (psiScore < 0.1) {
    interpretation = 'stable';
  } else if (psiScore < 0.2) {
    interpretation = 'minor_shift';
  } else {
    interpretation = 'major_shift';
  }

  return {
    psiScore,
    binAnalysis,
    interpretation
  };
}

/**
 * Feature Extraction from JSONB Data
 * Analyzes raw_props.data structure and extracts numeric features
 */
export function extractFeatures(jsonbData: any[]): Record<string, number[]> {
  const features: Record<string, number[]> = {};

  for (const record of jsonbData) {
    if (!record || typeof record !== 'object') continue;

    // Extract numeric features recursively
    const extractNumericFromObject = (obj: any, prefix: string = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'number') {
          if (!features[fullKey]) {
            features[fullKey] = [];
          }
          features[fullKey].push(value);
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          extractNumericFromObject(value, fullKey);
        } else if (Array.isArray(value)) {
          // Array length as a feature
          const lengthKey = `${fullKey}.length`;
          if (!features[lengthKey]) {
            features[lengthKey] = [];
          }
          features[lengthKey].push(value.length);
          
          // Numeric array elements
          value.forEach((item, index) => {
            if (typeof item === 'number') {
              const indexKey = `${fullKey}[${index}]`;
              if (!features[indexKey]) {
                features[indexKey] = [];
              }
              features[indexKey].push(item);
            }
          });
        }
      }
    };

    extractNumericFromObject(record);
  }

  return features;
}

/**
 * Configuration for drift detection thresholds
 */
interface DriftConfig {
  ks_test: {
    warn_threshold: number;    // D-statistic threshold for warning
    alert_threshold: number;   // D-statistic threshold for alert
    min_p_value: number;       // Minimum p-value for significance
  };
  psi: {
    warn_threshold: number;    // PSI score for warning (0.1)
    alert_threshold: number;   // PSI score for alert (0.2)
    bins: number;              // Number of bins for PSI calculation
  };
  baseline: {
    days: number;              // Rolling baseline window (30)
    min_samples: number;       // Minimum samples required
  };
  features: {
    min_frequency: number;     // Minimum feature frequency to include
    max_features: number;      // Maximum features to analyze
  };
}

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  ks_test: {
    warn_threshold: 0.1,
    alert_threshold: 0.2,
    min_p_value: 0.05
  },
  psi: {
    warn_threshold: 0.1,
    alert_threshold: 0.2,
    bins: 10
  },
  baseline: {
    days: 30,
    min_samples: 100
  },
  features: {
    min_frequency: 0.1, // Feature must appear in at least 10% of records
    max_features: 50
  }
};

/**
 * Drift Detection Result Structure
 */
interface DriftAnalysisResult {
  timestamp: string;
  analysis_window: {
    baseline_start: string;
    baseline_end: string;
    current_start: string;
    current_end: string;
  };
  sample_sizes: {
    baseline_count: number;
    current_count: number;
  };
  features: Array<{
    name: string;
    frequency_baseline: number;
    frequency_current: number;
    ks_test: {
      d_statistic: number;
      p_value: number;
      significant: boolean;
      interpretation: 'no_drift' | 'warn' | 'alert';
    };
    psi: {
      score: number;
      interpretation: 'stable' | 'minor_shift' | 'major_shift';
      alert_level: 'no_drift' | 'warn' | 'alert';
    };
    summary: {
      drift_detected: boolean;
      severity: 'low' | 'medium' | 'high';
      recommendation: string;
    };
  }>;
  overall_summary: {
    total_features_analyzed: number;
    features_with_drift: number;
    features_with_warnings: number;
    features_with_alerts: number;
    overall_risk_level: 'low' | 'medium' | 'high';
    recommendations: string[];
  };
  config_used: DriftConfig;
}

/**
 * Load drift detection configuration
 */
function loadDriftConfig(): DriftConfig {
  const configPath = join(process.cwd(), 'scripts', 'ops', 'drift-config.json');
  
  if (existsSync(configPath)) {
    try {
      const configData = readFileSync(configPath, 'utf-8');
      const userConfig = JSON.parse(configData);
      return { ...DEFAULT_DRIFT_CONFIG, ...userConfig };
    } catch (error) {
      logger.warn('Failed to load drift config, using defaults', { error });
    }
  }
  
  return DEFAULT_DRIFT_CONFIG;
}

/**
 * Fetch baseline data (30-day rolling window)
 */
async function fetchBaselineData(config: DriftConfig): Promise<any[]> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - config.baseline.days * 24 * 60 * 60 * 1000);
  
  try {
    const pool = getPgPool();
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT data 
        FROM raw_props 
        WHERE inserted_at BETWEEN $1 AND $2
          AND processed_at IS NOT NULL
        ORDER BY inserted_at ASC
      `;
      
      const result = await client.query(query, [startDate.toISOString(), endDate.toISOString()]);
      return result.rows.map((row: any) => row.data);
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to fetch baseline data', { error });
    throw error;
  }
}

/**
 * Fetch current data (last 24 hours)
 */
async function fetchCurrentData(): Promise<any[]> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
  
  try {
    const pool = getPgPool();
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT data 
        FROM raw_props 
        WHERE inserted_at BETWEEN $1 AND $2
          AND processed_at IS NOT NULL
        ORDER BY inserted_at ASC
      `;
      
      const result = await client.query(query, [startDate.toISOString(), endDate.toISOString()]);
      return result.rows.map((row: any) => row.data);
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to fetch current data', { error });
    throw error;
  }
}

/**
 * Main drift detection analysis
 */
async function performDriftAnalysis(): Promise<DriftAnalysisResult> {
  const config = loadDriftConfig();
  
  logger.info('Starting drift detection analysis', { config });

  // Fetch data
  const baselineData = await fetchBaselineData(config);
  const currentData = await fetchCurrentData();
  
  logger.info('Data fetched for analysis', {
    baseline_records: baselineData.length,
    current_records: currentData.length
  });

  if (baselineData.length < config.baseline.min_samples) {
    throw new Error(`Insufficient baseline data: ${baselineData.length} < ${config.baseline.min_samples}`);
  }

  if (currentData.length === 0) {
    throw new Error('No current data available for analysis');
  }

  // Extract features from both datasets
  const baselineFeatures = extractFeatures(baselineData);
  const currentFeatures = extractFeatures(currentData);
  
  // Find common features with sufficient frequency
  const commonFeatures = new Set<string>();
  for (const feature of Object.keys(baselineFeatures)) {
    if (currentFeatures[feature] &&
        baselineFeatures[feature].length >= config.baseline.min_samples * config.features.min_frequency &&
        currentFeatures[feature].length >= config.features.min_frequency * currentData.length) {
      commonFeatures.add(feature);
    }
  }

  logger.info('Feature analysis', {
    baseline_features: Object.keys(baselineFeatures).length,
    current_features: Object.keys(currentFeatures).length,
    common_features: commonFeatures.size
  });

  // Limit number of features analyzed
  const featuresToAnalyze = Array.from(commonFeatures).slice(0, config.features.max_features);
  
  // Perform drift analysis for each feature
  const featureAnalysis: DriftAnalysisResult['features'] = [];
  let featuresWithDrift = 0;
  let featuresWithWarnings = 0;
  let featuresWithAlerts = 0;
  
  for (const featureName of featuresToAnalyze) {
    const baselineValues = baselineFeatures[featureName];
    const currentValues = currentFeatures[featureName];
    
    // KS Test
    const ksResult = kolmogorovSmirnovTest(baselineValues, currentValues);
    let ksInterpretation: 'no_drift' | 'warn' | 'alert';
    
    if (ksResult.dStatistic >= config.ks_test.alert_threshold && ksResult.significant) {
      ksInterpretation = 'alert';
    } else if (ksResult.dStatistic >= config.ks_test.warn_threshold && ksResult.significant) {
      ksInterpretation = 'warn';
    } else {
      ksInterpretation = 'no_drift';
    }
    
    // PSI Test
    const psiResult = calculatePSI(baselineValues, currentValues, config.psi.bins);
    let psiAlertLevel: 'no_drift' | 'warn' | 'alert';
    
    if (psiResult.psiScore >= config.psi.alert_threshold) {
      psiAlertLevel = 'alert';
    } else if (psiResult.psiScore >= config.psi.warn_threshold) {
      psiAlertLevel = 'warn';
    } else {
      psiAlertLevel = 'no_drift';
    }
    
    // Overall assessment
    const driftDetected = ksInterpretation !== 'no_drift' || psiAlertLevel !== 'no_drift';
    const severity = (ksInterpretation === 'alert' || psiAlertLevel === 'alert') ? 'high' :
                     (ksInterpretation === 'warn' || psiAlertLevel === 'warn') ? 'medium' : 'low';
    
    let recommendation = 'No action required - feature distribution stable';
    if (severity === 'high') {
      recommendation = 'Immediate investigation required - significant distribution shift detected';
    } else if (severity === 'medium') {
      recommendation = 'Monitor closely - potential distribution shift detected';
    }
    
    if (driftDetected) featuresWithDrift++;
    if (ksInterpretation === 'warn' || psiAlertLevel === 'warn') featuresWithWarnings++;
    if (ksInterpretation === 'alert' || psiAlertLevel === 'alert') featuresWithAlerts++;
    
    featureAnalysis.push({
      name: featureName,
      frequency_baseline: baselineValues.length / baselineData.length,
      frequency_current: currentValues.length / currentData.length,
      ks_test: {
        d_statistic: ksResult.dStatistic,
        p_value: ksResult.pValue,
        significant: ksResult.significant,
        interpretation: ksInterpretation
      },
      psi: {
        score: psiResult.psiScore,
        interpretation: psiResult.interpretation,
        alert_level: psiAlertLevel
      },
      summary: {
        drift_detected: driftDetected,
        severity,
        recommendation
      }
    });
  }
  
  // Overall risk assessment
  let overallRiskLevel: 'low' | 'medium' | 'high' = 'low';
  const recommendations: string[] = [];
  
  if (featuresWithAlerts > 0) {
    overallRiskLevel = 'high';
    recommendations.push(`${featuresWithAlerts} features show significant drift - immediate investigation required`);
  } else if (featuresWithWarnings > 0) {
    overallRiskLevel = 'medium';
    recommendations.push(`${featuresWithWarnings} features show potential drift - increased monitoring recommended`);
  }
  
  if (featuresWithDrift === 0) {
    recommendations.push('All analyzed features are stable - continue regular monitoring');
  }
  
  recommendations.push(`Analyzed ${featuresToAnalyze.length} features out of ${commonFeatures.size} common features`);
  
  const currentTime = new Date();
  const currentStart = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
  const baselineEnd = currentTime;
  const baselineStart = new Date(baselineEnd.getTime() - config.baseline.days * 24 * 60 * 60 * 1000);
  
  return {
    timestamp: currentTime.toISOString(),
    analysis_window: {
      baseline_start: baselineStart.toISOString(),
      baseline_end: baselineEnd.toISOString(),
      current_start: currentStart.toISOString(),
      current_end: currentTime.toISOString()
    },
    sample_sizes: {
      baseline_count: baselineData.length,
      current_count: currentData.length
    },
    features: featureAnalysis,
    overall_summary: {
      total_features_analyzed: featuresToAnalyze.length,
      features_with_drift: featuresWithDrift,
      features_with_warnings: featuresWithWarnings,
      features_with_alerts: featuresWithAlerts,
      overall_risk_level: overallRiskLevel,
      recommendations
    },
    config_used: config
  };
}

/**
 * Save drift analysis results
 */
function saveDriftResults(result: DriftAnalysisResult): string {
  const outputDir = join(process.cwd(), 'out', 'ops');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = join(outputDir, 'drift.json');
  writeFileSync(outputFile, JSON.stringify(result, null, 2));
  
  logger.info('Drift analysis results saved', { 
    file: outputFile,
    overall_risk: result.overall_summary.overall_risk_level,
    features_analyzed: result.overall_summary.total_features_analyzed,
    alerts: result.overall_summary.features_with_alerts
  });
  
  return outputFile;
}

/**
 * Export function for ops-all integration
 */
export async function runDriftDetection(): Promise<{
  ok: boolean;
  risk_level: 'low' | 'medium' | 'high';
  features_analyzed: number;
  features_with_alerts: number;
  features_with_warnings: number;
  drift_score: number;
  details: DriftAnalysisResult | null;
  error?: string;
}> {
  try {
    logger.info('Running drift detection for ops integration');
    
    const result = await performDriftAnalysis();
    saveDriftResults(result);
    
    // Calculate overall drift score (0-1)
    const totalFeatures = result.overall_summary.total_features_analyzed;
    const alertWeight = 1.0;
    const warnWeight = 0.5;
    const driftScore = totalFeatures > 0 ? 
      (result.overall_summary.features_with_alerts * alertWeight + 
       result.overall_summary.features_with_warnings * warnWeight) / totalFeatures : 0;
    
    const success = result.overall_summary.overall_risk_level !== 'high';
    
    logger.info('Drift detection completed', {
      success,
      risk_level: result.overall_summary.overall_risk_level,
      features_analyzed: result.overall_summary.total_features_analyzed,
      drift_score: driftScore
    });
    
    return {
      ok: success,
      risk_level: result.overall_summary.overall_risk_level,
      features_analyzed: result.overall_summary.total_features_analyzed,
      features_with_alerts: result.overall_summary.features_with_alerts,
      features_with_warnings: result.overall_summary.features_with_warnings,
      drift_score: driftScore,
      details: result
    };
    
  } catch (error) {
    logger.error('Drift detection failed in ops integration', { error });
    
    return {
      ok: false,
      risk_level: 'high',
      features_analyzed: 0,
      features_with_alerts: 0,
      features_with_warnings: 0,
      drift_score: 1.0,
      details: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    logger.info('Starting feature/label drift detection analysis');
    
    const result = await performDriftAnalysis();
    const outputFile = saveDriftResults(result);
    
    // Log summary
    console.log('\n=== DRIFT DETECTION SUMMARY ===');
    console.log(`Timestamp: ${result.timestamp}`);
    console.log(`Overall Risk Level: ${result.overall_summary.overall_risk_level.toUpperCase()}`);
    console.log(`Features Analyzed: ${result.overall_summary.total_features_analyzed}`);
    console.log(`Features with Drift: ${result.overall_summary.features_with_drift}`);
    console.log(`Warnings: ${result.overall_summary.features_with_warnings}`);
    console.log(`Alerts: ${result.overall_summary.features_with_alerts}`);
    console.log(`Output File: ${outputFile}`);
    
    if (result.overall_summary.features_with_alerts > 0) {
      console.log('\n🚨 CRITICAL ALERTS:');
      result.features
        .filter(f => f.ks_test.interpretation === 'alert' || f.psi.alert_level === 'alert')
        .forEach(f => {
          console.log(`  - ${f.name}: KS=${f.ks_test.d_statistic.toFixed(4)}, PSI=${f.psi.score.toFixed(4)}`);
        });
    }
    
    if (result.overall_summary.features_with_warnings > 0) {
      console.log('\n⚠️  WARNINGS:');
      result.features
        .filter(f => (f.ks_test.interpretation === 'warn' || f.psi.alert_level === 'warn') && 
                     f.ks_test.interpretation !== 'alert' && f.psi.alert_level !== 'alert')
        .forEach(f => {
          console.log(`  - ${f.name}: KS=${f.ks_test.d_statistic.toFixed(4)}, PSI=${f.psi.score.toFixed(4)}`);
        });
    }
    
    logger.info('Drift detection analysis completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error('Drift detection analysis failed', { error });
    console.error('\n❌ DRIFT DETECTION FAILED');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  main();
}