#!/usr/bin/env node

/**
 * Drift Detection Acceptance Test
 * 
 * Validates that drift detection system is working correctly:
 * - Can analyze features from raw_props data
 * - Statistical tests are functioning
 * - Thresholds are properly configured
 * - Integration with ops system works
 */

import '../shared/bootstrapEnv';
import { getPgPool } from '../shared/db';
import { logger } from '@unit-talk/observability';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { runDriftDetection } from '../ops/drift';

// Environment loaded via import

interface DriftAcceptanceResult {
  timestamp: string;
  ok: boolean;
  tests: {
    data_availability: {
      ok: boolean;
      baseline_records: number;
      current_records: number;
      error?: string;
    };
    statistical_functions: {
      ok: boolean;
      ks_test_functional: boolean;
      psi_test_functional: boolean;
      error?: string;
    };
    configuration: {
      ok: boolean;
      config_loaded: boolean;
      thresholds_valid: boolean;
      error?: string;
    };
    feature_extraction: {
      ok: boolean;
      features_found: number;
      extraction_successful: boolean;
      error?: string;
    };
    ops_integration: {
      ok: boolean;
      drift_component_present: boolean;
      ops_execution_successful: boolean;
      error?: string;
    };
  };
  overall_score: number;
  recommendations: string[];
}

/**
 * Test data availability for drift analysis
 */
async function testDataAvailability(): Promise<DriftAcceptanceResult['tests']['data_availability']> {
  try {
    const pool = getPgPool();
    const client = await pool.connect();
    
    // Test baseline data (30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    
    const baselineQuery = `
      SELECT COUNT(*) as count 
      FROM raw_props 
      WHERE inserted_at BETWEEN $1 AND $2
        AND processed_at IS NOT NULL
    `;
    
    const baselineResult = await client.query(baselineQuery, [thirtyDaysAgo.toISOString(), now.toISOString()]);
    const baselineRecords = parseInt(baselineResult.rows[0].count, 10);
    
    // Test current data (24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const currentQuery = `
      SELECT COUNT(*) as count 
      FROM raw_props 
      WHERE inserted_at BETWEEN $1 AND $2
        AND processed_at IS NOT NULL
    `;
    
    const currentResult = await client.query(currentQuery, [twentyFourHoursAgo.toISOString(), now.toISOString()]);
    const currentRecords = parseInt(currentResult.rows[0].count, 10);
    
    const hasMinimumData = baselineRecords >= 100 && currentRecords >= 10;
    
    client.release();
    
    return {
      ok: hasMinimumData,
      baseline_records: baselineRecords,
      current_records: currentRecords,
    };
  } catch (error) {
    return {
      ok: false,
      baseline_records: 0,
      current_records: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test statistical functions
 */
async function testStatisticalFunctions(): Promise<DriftAcceptanceResult['tests']['statistical_functions']> {
  try {
    // Import statistical functions from drift module
    const { kolmogorovSmirnovTest, calculatePSI } = require('../ops/drift');
    
    // Test KS function with known distributions
    const sample1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const sample2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Same distribution
    const sample3 = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // Shifted distribution
    
    // Test with identical distributions (should have low D-statistic)
    const ksResult1 = kolmogorovSmirnovTest(sample1, sample2);
    const ksTest1OK = ksResult1.dStatistic < 0.1;
    
    // Test with different distributions (should have higher D-statistic)
    const ksResult2 = kolmogorovSmirnovTest(sample1, sample3);
    const ksTest2OK = ksResult2.dStatistic > 0.1;
    
    const ksFunctional = ksTest1OK && ksTest2OK;
    
    // Test PSI function
    const baseline = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const current1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Same
    const current2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // Shifted
    
    const psiResult1 = calculatePSI(baseline, current1);
    const psiTest1OK = psiResult1.psiScore < 0.1 && psiResult1.interpretation === 'stable';
    
    const psiResult2 = calculatePSI(baseline, current2);
    const psiTest2OK = psiResult2.psiScore > 0.1;
    
    const psiFunctional = psiTest1OK && psiTest2OK;
    
    return {
      ok: ksFunctional && psiFunctional,
      ks_test_functional: ksFunctional,
      psi_test_functional: psiFunctional,
    };
  } catch (error) {
    return {
      ok: false,
      ks_test_functional: false,
      psi_test_functional: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test configuration system
 */
async function testConfiguration(): Promise<DriftAcceptanceResult['tests']['configuration']> {
  try {
    const configPath = join(process.cwd(), 'scripts', 'ops', 'drift-config.json');
    const configExists = existsSync(configPath);
    
    if (!configExists) {
      return {
        ok: false,
        config_loaded: false,
        thresholds_valid: false,
        error: 'drift-config.json not found',
      };
    }
    
    const configContent = require(configPath);
    
    // Validate required configuration structure
    const hasKSThresholds = configContent.ks_test && 
                           typeof configContent.ks_test.warn_threshold === 'number' &&
                           typeof configContent.ks_test.alert_threshold === 'number';
    
    const hasPSIThresholds = configContent.psi && 
                            typeof configContent.psi.warn_threshold === 'number' &&
                            typeof configContent.psi.alert_threshold === 'number';
    
    const hasBaselineConfig = configContent.baseline && 
                             typeof configContent.baseline.days === 'number' &&
                             typeof configContent.baseline.min_samples === 'number';
    
    const thresholdsValid = hasKSThresholds && hasPSIThresholds && hasBaselineConfig;
    
    return {
      ok: thresholdsValid,
      config_loaded: true,
      thresholds_valid: thresholdsValid,
    };
  } catch (error) {
    return {
      ok: false,
      config_loaded: false,
      thresholds_valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test feature extraction
 */
async function testFeatureExtraction(): Promise<DriftAcceptanceResult['tests']['feature_extraction']> {
  try {
    const pool = getPgPool();
    const client = await pool.connect();
    
    // Get sample data from raw_props
    const query = `
      SELECT data 
      FROM raw_props 
      WHERE processed_at IS NOT NULL
      LIMIT 10
    `;
    
    const result = await client.query(query);
    const sampleData = result.rows.map(row => row.data);
    
    if (sampleData.length === 0) {
      return {
        ok: false,
        features_found: 0,
        extraction_successful: false,
        error: 'No processed data available for feature extraction test',
      };
    }
    
    // Import feature extraction function
    const { extractFeatures } = require('../ops/drift');
    
    const features = extractFeatures(sampleData);
    const featureCount = Object.keys(features).length;
    
    client.release();
    
    return {
      ok: featureCount > 0,
      features_found: featureCount,
      extraction_successful: featureCount > 0,
    };
  } catch (error) {
    return {
      ok: false,
      features_found: 0,
      extraction_successful: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test ops integration
 */
async function testOpsIntegration(): Promise<DriftAcceptanceResult['tests']['ops_integration']> {
  try {
    // Test drift detection function directly
    const driftResult = await runDriftDetection();
    
    // Check if ops dashboard includes drift component
    const dashboardPath = join(process.cwd(), 'out', 'ops', 'dashboard.json');
    const dashboardExists = existsSync(dashboardPath);
    
    let hasDriftComponent = false;
    if (dashboardExists) {
      try {
        const dashboard = require(dashboardPath);
        hasDriftComponent = !!dashboard.components?.drift;
      } catch (e) {
        // Dashboard file might not be valid JSON yet
      }
    }
    
    return {
      ok: typeof driftResult.ok === 'boolean' && (hasDriftComponent || !dashboardExists),
      drift_component_present: hasDriftComponent,
      ops_execution_successful: typeof driftResult.ok === 'boolean',
    };
  } catch (error) {
    return {
      ok: false,
      drift_component_present: false,
      ops_execution_successful: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main acceptance test function
 */
async function runDriftAcceptanceTest(): Promise<DriftAcceptanceResult> {
  logger.info('Starting drift detection acceptance test');
  
  const tests = await Promise.all([
    testDataAvailability(),
    testStatisticalFunctions(),
    testConfiguration(),
    testFeatureExtraction(),
    testOpsIntegration(),
  ]);
  
  const [dataAvailability, statisticalFunctions, configuration, featureExtraction, opsIntegration] = tests;
  
  // Calculate overall score
  const testResults = [
    dataAvailability.ok,
    statisticalFunctions.ok,
    configuration.ok,
    featureExtraction.ok,
    opsIntegration.ok,
  ];
  
  const passedTests = testResults.filter(Boolean).length;
  const overallScore = passedTests / testResults.length;
  const overallOK = overallScore >= 0.8; // 80% pass rate required
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (!dataAvailability.ok) {
    recommendations.push(`Insufficient data: Need ≥100 baseline records (found ${dataAvailability.baseline_records}) and ≥10 current records (found ${dataAvailability.current_records})`);
  }
  
  if (!statisticalFunctions.ok) {
    if (!statisticalFunctions.ks_test_functional) {
      recommendations.push('Kolmogorov-Smirnov test function is not working correctly');
    }
    if (!statisticalFunctions.psi_test_functional) {
      recommendations.push('Population Stability Index calculation is not working correctly');
    }
  }
  
  if (!configuration.ok) {
    recommendations.push('Configuration validation failed - check drift-config.json structure and thresholds');
  }
  
  if (!featureExtraction.ok) {
    recommendations.push('Feature extraction from raw_props data failed - check data structure and extraction logic');
  }
  
  if (!opsIntegration.ok) {
    recommendations.push('Integration with ops system failed - check runDriftDetection function and dashboard updates');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All drift detection acceptance tests passed - system ready for production');
  }
  
  const result: DriftAcceptanceResult = {
    timestamp: new Date().toISOString(),
    ok: overallOK,
    tests: {
      data_availability: dataAvailability,
      statistical_functions: statisticalFunctions,
      configuration: configuration,
      feature_extraction: featureExtraction,
      ops_integration: opsIntegration,
    },
    overall_score: overallScore,
    recommendations,
  };
  
  // Save results
  const outputDir = join(process.cwd(), 'out', 'acceptance');
  mkdirSync(outputDir, { recursive: true });
  
  const outputFile = join(outputDir, 'drift-acceptance.json');
  writeFileSync(outputFile, JSON.stringify(result, null, 2));
  
  logger.info('Drift acceptance test completed', {
    ok: overallOK,
    score: overallScore,
    passed: passedTests,
    total: testResults.length,
    output: outputFile,
  });
  
  return result;
}

/**
 * Main execution
 */
async function main() {
  try {
    const result = await runDriftAcceptanceTest();
    
    console.log('\n=== DRIFT DETECTION ACCEPTANCE TEST ===');
    console.log(`Overall Status: ${result.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Score: ${(result.overall_score * 100).toFixed(1)}%`);
    console.log(`Timestamp: ${result.timestamp}`);
    
    console.log('\n=== TEST RESULTS ===');
    console.log(`Data Availability: ${result.tests.data_availability.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Statistical Functions: ${result.tests.statistical_functions.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Configuration: ${result.tests.configuration.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Feature Extraction: ${result.tests.feature_extraction.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Ops Integration: ${result.tests.ops_integration.ok ? 'PASS' : 'FAIL'}`);
    
    if (result.recommendations.length > 0) {
      console.log('\n=== RECOMMENDATIONS ===');
      result.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }
    
    process.exit(result.ok ? 0 : 1);
    
  } catch (error) {
    logger.error('Drift acceptance test failed', { error });
    console.error('❌ ACCEPTANCE TEST FAILED');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  main();
}

export { runDriftAcceptanceTest, DriftAcceptanceResult };