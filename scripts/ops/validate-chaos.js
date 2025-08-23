#!/usr/bin/env node

/**
 * CHAOS FRAMEWORK VALIDATION SCRIPT
 * =================================
 * 
 * Comprehensive validation suite for the chaos engineering framework.
 * Tests all components, safety features, and integration points.
 * 
 * Features:
 * - Framework component validation
 * - Safety mechanism testing
 * - Integration point verification
 * - Performance benchmark testing
 * - Cross-platform compatibility checks
 * 
 * Usage:
 *   node scripts/ops/validate-chaos.js --full
 *   node scripts/ops/validate-chaos.js --component chaos
 *   node scripts/ops/validate-chaos.js --safety-tests
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

// Import chaos components for testing
const { ChaosEngineeringFramework, CHAOS_CONFIG } = require('./chaos.js');
const { ChaosMonitor } = require('./chaos-monitor.js');
const { ChaosTestRunner } = require('./chaos-runner.js');

class ChaosValidationSuite {
  constructor() {
    this.outputDir = path.join(process.cwd(), 'out', 'ops');
    this.results = {
      startTime: new Date().toISOString(),
      testSuite: 'chaos_framework_validation',
      version: '1.0.0',
      components: {},
      safety: {},
      integration: {},
      performance: {},
      summary: {}
    };
  }

  /**
   * Run full validation suite
   */
  async runFullValidation() {
    console.log('🔥 CHAOS FRAMEWORK VALIDATION SUITE\n');
    console.log('Running comprehensive validation of all components...\n');
    
    try {
      // Component validation
      await this.validateComponents();
      
      // Safety mechanism testing
      await this.validateSafetyMechanisms();
      
      // Integration testing
      await this.validateIntegration();
      
      // Performance benchmarking
      await this.validatePerformance();
      
      // Generate final report
      await this.generateValidationReport();
      
      console.log('\n✅ Chaos framework validation completed successfully');
      
    } catch (error) {
      console.error(`\n❌ Validation failed: ${error.message}`);
      await this.generateValidationReport();
      throw error;
    }
  }

  /**
   * Validate core framework components
   */
  async validateComponents() {
    console.log('🧪 Component Validation\n');
    
    const components = {
      chaos_framework: false,
      chaos_monitor: false,
      chaos_runner: false,
      configuration: false
    };
    
    try {
      // Test ChaosEngineeringFramework
      console.log('   Testing ChaosEngineeringFramework...');
      const chaos = new ChaosEngineeringFramework();
      await chaos.initialize();
      await chaos.cleanup();
      components.chaos_framework = true;
      console.log('   ✅ ChaosEngineeringFramework validated');
      
      // Test ChaosMonitor
      console.log('   Testing ChaosMonitor...');
      const monitor = new ChaosMonitor({ duration: 1, interval: 1000 });
      // Test basic instantiation and config
      if (monitor.options && monitor.options.duration === 1) {
        components.chaos_monitor = true;
        console.log('   ✅ ChaosMonitor validated');
      }
      
      // Test ChaosTestRunner
      console.log('   Testing ChaosTestRunner...');
      const runner = new ChaosTestRunner();
      if (runner.chaos && runner.outputDir) {
        components.chaos_runner = true;
        console.log('   ✅ ChaosTestRunner validated');
      }
      
      // Test Configuration
      console.log('   Testing configuration structure...');
      const configValid = (
        CHAOS_CONFIG.modes &&
        CHAOS_CONFIG.scenarios &&
        CHAOS_CONFIG.safety &&
        Object.keys(CHAOS_CONFIG.modes).length > 0 &&
        Object.keys(CHAOS_CONFIG.scenarios).length > 0
      );
      
      if (configValid) {
        components.configuration = true;
        console.log('   ✅ Configuration structure validated');
      }
      
      this.results.components = {
        timestamp: new Date().toISOString(),
        tests_run: Object.keys(components).length,
        tests_passed: Object.values(components).filter(c => c).length,
        components,
        all_passed: Object.values(components).every(c => c)
      };
      
      console.log(`\n   📊 Component validation: ${this.results.components.tests_passed}/${this.results.components.tests_run} passed\n`);
      
    } catch (error) {
      this.results.components = {
        timestamp: new Date().toISOString(),
        error: error.message,
        components,
        all_passed: false
      };
      throw new Error(`Component validation failed: ${error.message}`);
    }
  }

  /**
   * Validate safety mechanisms
   */
  async validateSafetyMechanisms() {
    console.log('🛡️  Safety Mechanism Validation\n');
    
    const safetyTests = {
      environment_protection: false,
      flag_validation: false,
      threshold_monitoring: false,
      automatic_rollback: false,
      emergency_procedures: false
    };
    
    try {
      // Test environment protection
      console.log('   Testing environment protection...');
      const originalEnv = process.env.NODE_ENV;
      
      // Test production blocking
      process.env.NODE_ENV = 'production';
      const chaos = new ChaosEngineeringFramework();
      
      try {
        await chaos.validateEnvironment();
        safetyTests.environment_protection = false; // Should have thrown
      } catch (error) {
        if (error.message.includes('Production environment detected')) {
          safetyTests.environment_protection = true;
          console.log('   ✅ Production environment correctly blocked');
        }
      }
      
      // Restore environment
      process.env.NODE_ENV = originalEnv;
      
      // Test flag validation
      console.log('   Testing flag validation...');
      const originalShadow = process.env.SHADOW_MODE;
      const originalDiscord = process.env.PUBLISH_TO_DISCORD;
      
      process.env.SHADOW_MODE = 'false';
      process.env.PUBLISH_TO_DISCORD = 'true';
      
      try {
        await chaos.validateEnvironment();
        safetyTests.flag_validation = false; // Should have thrown
      } catch (error) {
        if (error.message.includes('SHADOW_MODE') || error.message.includes('PUBLISH_TO_DISCORD')) {
          safetyTests.flag_validation = true;
          console.log('   ✅ Flag validation working correctly');
        }
      }
      
      // Restore flags
      process.env.SHADOW_MODE = originalShadow;
      process.env.PUBLISH_TO_DISCORD = originalDiscord;
      
      // Test threshold monitoring
      console.log('   Testing threshold monitoring...');
      const monitor = new ChaosMonitor({ alertThreshold: 0.8 });
      
      // Create mock high-usage metrics
      const highUsageMetrics = {
        memoryUsage: 0.95,
        cpuUsage: 0.90,
        responseTime: 12000,
        errorRate: 0.6
      };
      
      monitor.metrics.alerts = []; // Clear alerts
      await monitor.checkAlerts(highUsageMetrics);
      
      if (monitor.metrics.alerts.length > 0) {
        safetyTests.threshold_monitoring = true;
        console.log('   ✅ Threshold monitoring generating alerts');
      }
      
      // Test rollback capability
      console.log('   Testing rollback procedures...');
      await chaos.initialize();
      chaos.isRunning = true;
      chaos.recoveryProcedures.set('test', async () => {
        return Promise.resolve();
      });
      
      await chaos.rollback();
      
      if (!chaos.isRunning && chaos.recoveryProcedures.size === 0) {
        safetyTests.automatic_rollback = true;
        console.log('   ✅ Automatic rollback functioning');
      }
      
      // Test emergency procedures
      console.log('   Testing emergency procedures...');
      chaos.isRunning = true;
      await chaos.emergencyRollback('Test emergency');
      
      if (!chaos.isRunning) {
        safetyTests.emergency_procedures = true;
        console.log('   ✅ Emergency procedures functioning');
      }
      
      this.results.safety = {
        timestamp: new Date().toISOString(),
        tests_run: Object.keys(safetyTests).length,
        tests_passed: Object.values(safetyTests).filter(s => s).length,
        safety_tests: safetyTests,
        all_passed: Object.values(safetyTests).every(s => s)
      };
      
      console.log(`\n   🛡️  Safety validation: ${this.results.safety.tests_passed}/${this.results.safety.tests_run} passed\n`);
      
    } catch (error) {
      this.results.safety = {
        timestamp: new Date().toISOString(),
        error: error.message,
        safety_tests: safetyTests,
        all_passed: false
      };
      throw new Error(`Safety validation failed: ${error.message}`);
    }
  }

  /**
   * Validate integration points
   */
  async validateIntegration() {
    console.log('🔗 Integration Validation\n');
    
    const integrationTests = {
      slo_config_access: false,
      exposure_config_access: false,
      docker_integration: false,
      output_directory: false,
      operational_scripts: false
    };
    
    try {
      // Test SLO configuration access
      console.log('   Testing SLO configuration access...');
      try {
        const sloPath = path.join(process.cwd(), 'config', 'slo.json');
        const sloConfig = JSON.parse(await fs.readFile(sloPath, 'utf-8'));
        
        if (sloConfig.slo_targets && sloConfig.error_budget) {
          integrationTests.slo_config_access = true;
          console.log('   ✅ SLO configuration accessible');
        }
      } catch (error) {
        console.log('   ❌ SLO configuration not accessible');
      }
      
      // Test exposure configuration access
      console.log('   Testing exposure configuration access...');
      try {
        const exposurePath = path.join(process.cwd(), 'config', 'exposure.json');
        const exposureConfig = JSON.parse(await fs.readFile(exposurePath, 'utf-8'));
        
        if (exposureConfig.caps && exposureConfig.global_limits) {
          integrationTests.exposure_config_access = true;
          console.log('   ✅ Exposure configuration accessible');
        }
      } catch (error) {
        console.log('   ❌ Exposure configuration not accessible');
      }
      
      // Test Docker integration
      console.log('   Testing Docker integration...');
      try {
        const { stdout } = await execAsync('docker --version 2>/dev/null || echo "Docker not available"');
        
        if (!stdout.includes('not available')) {
          integrationTests.docker_integration = true;
          console.log('   ✅ Docker integration available');
        }
      } catch (error) {
        console.log('   ❌ Docker integration not available');
      }
      
      // Test output directory creation
      console.log('   Testing output directory handling...');
      try {
        await fs.mkdir(this.outputDir, { recursive: true });
        
        const testFile = path.join(this.outputDir, 'test.json');
        await fs.writeFile(testFile, JSON.stringify({ test: true }));
        await fs.unlink(testFile);
        
        integrationTests.output_directory = true;
        console.log('   ✅ Output directory handling working');
      } catch (error) {
        console.log('   ❌ Output directory handling failed');
      }
      
      // Test operational script integration
      console.log('   Testing operational script integration...');
      try {
        // Check if package.json has relevant scripts
        const packagePath = path.join(process.cwd(), 'package.json');
        const packageConfig = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
        
        const hasOpsScripts = packageConfig.scripts && (
          packageConfig.scripts['ops:slo'] ||
          packageConfig.scripts['ops:parity-check'] ||
          packageConfig.scripts['db:check']
        );
        
        if (hasOpsScripts) {
          integrationTests.operational_scripts = true;
          console.log('   ✅ Operational script integration available');
        }
      } catch (error) {
        console.log('   ❌ Operational script integration not available');
      }
      
      this.results.integration = {
        timestamp: new Date().toISOString(),
        tests_run: Object.keys(integrationTests).length,
        tests_passed: Object.values(integrationTests).filter(i => i).length,
        integration_tests: integrationTests,
        all_passed: Object.values(integrationTests).every(i => i)
      };
      
      console.log(`\n   🔗 Integration validation: ${this.results.integration.tests_passed}/${this.results.integration.tests_run} passed\n`);
      
    } catch (error) {
      this.results.integration = {
        timestamp: new Date().toISOString(),
        error: error.message,
        integration_tests: integrationTests,
        all_passed: false
      };
      throw new Error(`Integration validation failed: ${error.message}`);
    }
  }

  /**
   * Validate performance characteristics
   */
  async validatePerformance() {
    console.log('⚡ Performance Validation\n');
    
    const performanceTests = {
      initialization_time: 0,
      memory_usage: 0,
      monitoring_overhead: 0,
      report_generation_time: 0,
      cleanup_time: 0
    };
    
    try {
      // Test initialization performance
      console.log('   Testing initialization performance...');
      const initStart = Date.now();
      const chaos = new ChaosEngineeringFramework();
      await chaos.initialize();
      const initTime = Date.now() - initStart;
      performanceTests.initialization_time = initTime;
      console.log(`   ⏱️  Initialization time: ${initTime}ms`);
      
      // Test memory usage
      console.log('   Testing memory usage...');
      const memUsed = process.memoryUsage();
      const memMB = Math.round(memUsed.heapUsed / 1024 / 1024);
      performanceTests.memory_usage = memMB;
      console.log(`   💾 Memory usage: ${memMB}MB`);
      
      // Test monitoring overhead
      console.log('   Testing monitoring overhead...');
      const monitor = new ChaosMonitor({ interval: 100, duration: 1 });
      const monitorStart = Date.now();
      
      // Simulate monitoring for 1 second
      for (let i = 0; i < 5; i++) {
        await monitor.collectMetrics();
      }
      
      const monitorTime = Date.now() - monitorStart;
      performanceTests.monitoring_overhead = Math.round(monitorTime / 5); // Average per collection
      console.log(`   📊 Monitoring overhead: ${performanceTests.monitoring_overhead}ms per collection`);
      
      // Test report generation performance
      console.log('   Testing report generation performance...');
      const reportStart = Date.now();
      
      // Generate mock monitoring data
      monitor.metrics.systemHealth = Array(100).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - (100 - i) * 1000).toISOString(),
        memoryUsage: 0.5 + Math.random() * 0.3,
        cpuUsage: 0.3 + Math.random() * 0.4,
        responseTime: 500 + Math.random() * 1000,
        errorRate: Math.random() * 0.1,
        healthy: Math.random() > 0.1
      }));
      
      await monitor.generateReport();
      const reportTime = Date.now() - reportStart;
      performanceTests.report_generation_time = reportTime;
      console.log(`   📄 Report generation time: ${reportTime}ms`);
      
      // Test cleanup performance
      console.log('   Testing cleanup performance...');
      const cleanupStart = Date.now();
      await chaos.cleanup();
      const cleanupTime = Date.now() - cleanupStart;
      performanceTests.cleanup_time = cleanupTime;
      console.log(`   🧹 Cleanup time: ${cleanupTime}ms`);
      
      this.results.performance = {
        timestamp: new Date().toISOString(),
        benchmarks: performanceTests,
        performance_summary: {
          total_test_time: Object.values(performanceTests).reduce((a, b) => a + b, 0),
          acceptable_performance: (
            performanceTests.initialization_time < 5000 &&
            performanceTests.memory_usage < 100 &&
            performanceTests.monitoring_overhead < 500 &&
            performanceTests.report_generation_time < 10000 &&
            performanceTests.cleanup_time < 2000
          )
        }
      };
      
      const acceptable = this.results.performance.performance_summary.acceptable_performance;
      console.log(`\n   ⚡ Performance: ${acceptable ? '✅ Acceptable' : '⚠️  Needs optimization'}\n`);
      
    } catch (error) {
      this.results.performance = {
        timestamp: new Date().toISOString(),
        error: error.message,
        benchmarks: performanceTests
      };
      throw new Error(`Performance validation failed: ${error.message}`);
    }
  }

  /**
   * Generate comprehensive validation report
   */
  async generateValidationReport() {
    console.log('📊 Generating Validation Report\n');
    
    const endTime = new Date().toISOString();
    const duration = (new Date(endTime) - new Date(this.results.startTime)) / 1000;
    
    // Calculate overall success
    const componentSuccess = this.results.components?.all_passed || false;
    const safetySuccess = this.results.safety?.all_passed || false;
    const integrationSuccess = this.results.integration?.all_passed || false;
    const performanceAcceptable = this.results.performance?.performance_summary?.acceptable_performance || false;
    
    const overallSuccess = componentSuccess && safetySuccess && integrationSuccess && performanceAcceptable;
    
    this.results.summary = {
      endTime,
      duration_seconds: Math.round(duration),
      overall_success: overallSuccess,
      component_validation: componentSuccess,
      safety_validation: safetySuccess,
      integration_validation: integrationSuccess,
      performance_validation: performanceAcceptable,
      total_tests_run: (
        (this.results.components?.tests_run || 0) +
        (this.results.safety?.tests_run || 0) +
        (this.results.integration?.tests_run || 0) +
        Object.keys(this.results.performance?.benchmarks || {}).length
      ),
      total_tests_passed: (
        (this.results.components?.tests_passed || 0) +
        (this.results.safety?.tests_passed || 0) +
        (this.results.integration?.tests_passed || 0)
      ),
      recommendations: this.generateValidationRecommendations()
    };
    
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Write validation report
    const reportPath = path.join(this.outputDir, 'chaos-validation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(this.results, null, 2));
    
    // Also create timestamped version
    const timestampedPath = path.join(
      this.outputDir,
      `chaos-validation-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`
    );
    await fs.writeFile(timestampedPath, JSON.stringify(this.results, null, 2));
    
    console.log(`   📄 Validation report: ${reportPath}`);
    console.log(`   📄 Timestamped copy: ${timestampedPath}`);
    
    // Display summary
    this.displayValidationSummary();
    
    return this.results;
  }

  /**
   * Generate validation recommendations
   */
  generateValidationRecommendations() {
    const recommendations = [];
    
    if (!this.results.components?.all_passed) {
      recommendations.push('Component validation failures detected - review framework initialization');
    }
    
    if (!this.results.safety?.all_passed) {
      recommendations.push('Safety mechanism issues found - verify environment protection and rollback procedures');
    }
    
    if (!this.results.integration?.all_passed) {
      recommendations.push('Integration issues detected - check configuration files and operational script availability');
    }
    
    if (!this.results.performance?.performance_summary?.acceptable_performance) {
      recommendations.push('Performance benchmarks below acceptable thresholds - consider optimization');
    }
    
    // Check specific performance issues
    const perf = this.results.performance?.benchmarks || {};
    if (perf.initialization_time > 3000) {
      recommendations.push('Framework initialization is slow - review startup procedures');
    }
    
    if (perf.memory_usage > 80) {
      recommendations.push('Memory usage is high - review object lifecycle and cleanup');
    }
    
    if (perf.monitoring_overhead > 300) {
      recommendations.push('Monitoring overhead is high - optimize metric collection');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('All validation tests passed - chaos framework ready for use');
      recommendations.push('Consider running periodic validation to ensure continued compliance');
    }
    
    return recommendations;
  }

  /**
   * Display validation summary
   */
  displayValidationSummary() {
    const summary = this.results.summary;
    
    console.log(`\n🎯 CHAOS FRAMEWORK VALIDATION SUMMARY`);
    console.log(`==========================================`);
    console.log(`Validation Duration: ${summary.duration_seconds}s`);
    console.log(`Overall Success: ${summary.overall_success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Total Tests: ${summary.total_tests_run} run, ${summary.total_tests_passed} passed`);
    
    console.log(`\n📋 Category Results:`);
    console.log(`   Components: ${summary.component_validation ? '✅' : '❌'} (${this.results.components?.tests_passed || 0}/${this.results.components?.tests_run || 0})`);
    console.log(`   Safety: ${summary.safety_validation ? '✅' : '❌'} (${this.results.safety?.tests_passed || 0}/${this.results.safety?.tests_run || 0})`);
    console.log(`   Integration: ${summary.integration_validation ? '✅' : '❌'} (${this.results.integration?.tests_passed || 0}/${this.results.integration?.tests_run || 0})`);
    console.log(`   Performance: ${summary.performance_validation ? '✅' : '❌'} (benchmarks within acceptable ranges)`);
    
    const perf = this.results.performance?.benchmarks || {};
    if (Object.keys(perf).length > 0) {
      console.log(`\n⚡ Performance Benchmarks:`);
      console.log(`   Initialization: ${perf.initialization_time}ms`);
      console.log(`   Memory Usage: ${perf.memory_usage}MB`);
      console.log(`   Monitoring Overhead: ${perf.monitoring_overhead}ms/collection`);
      console.log(`   Report Generation: ${perf.report_generation_time}ms`);
      console.log(`   Cleanup: ${perf.cleanup_time}ms`);
    }
    
    if (summary.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      summary.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    displayHelp();
    return;
  }
  
  const validator = new ChaosValidationSuite();
  
  try {
    if (args.includes('--full') || args.length === 0) {
      // Run full validation suite
      await validator.runFullValidation();
      
    } else if (args.includes('--component')) {
      const component = args[args.indexOf('--component') + 1];
      if (component === 'chaos') {
        await validator.validateComponents();
      } else {
        console.error('❌ Unknown component. Available: chaos');
        process.exit(1);
      }
      
    } else if (args.includes('--safety-tests')) {
      await validator.validateSafetyMechanisms();
      
    } else if (args.includes('--integration-tests')) {
      await validator.validateIntegration();
      
    } else if (args.includes('--performance-tests')) {
      await validator.validatePerformance();
      
    } else {
      console.error('❌ Unknown validation option');
      displayHelp();
      process.exit(1);
    }
    
    await validator.generateValidationReport();
    
    const success = validator.results.summary?.overall_success;
    if (success === false) {
      console.log('\n⚠️  Some validation tests failed - review recommendations');
      process.exit(1);
    }
    
    console.log('\n🎉 Chaos framework validation completed successfully!');
    
  } catch (error) {
    console.error(`\n💥 Validation failed: ${error.message}`);
    process.exit(1);
  }
}

function displayHelp() {
  console.log(`
🔥 CHAOS FRAMEWORK VALIDATION SUITE
====================================

DESCRIPTION:
  Comprehensive validation suite for the chaos engineering framework.
  Tests components, safety features, integration points, and performance.

USAGE:
  node scripts/ops/validate-chaos.js [OPTIONS]

OPTIONS:
  --full                  Run complete validation suite (default)
  --component <name>      Validate specific component (chaos)
  --safety-tests          Run safety mechanism tests only
  --integration-tests     Run integration point tests only  
  --performance-tests     Run performance benchmarks only
  --help, -h             Show this help message

VALIDATION CATEGORIES:
  🧪 Components           Core framework classes and configuration
  🛡️  Safety Mechanisms   Environment protection and automatic rollback
  🔗 Integration Points   SLO config, Docker, operational scripts
  ⚡ Performance         Initialization, memory, monitoring overhead

EXAMPLES:
  node scripts/ops/validate-chaos.js --full
  node scripts/ops/validate-chaos.js --safety-tests
  node scripts/ops/validate-chaos.js --component chaos

OUTPUT:
  Validation report: out/ops/chaos-validation-report.json
  Timestamped copy: out/ops/chaos-validation-YYYY-MM-DD-{timestamp}.json

EXIT CODES:
  0: All validation tests passed
  1: One or more validation tests failed

Run this validation suite before using the chaos engineering framework
in staging or production environments to ensure all components are
functioning correctly and safely.
`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { ChaosValidationSuite };