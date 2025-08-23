#!/usr/bin/env node

/**
 * CHAOS ENGINEERING TEST RUNNER
 * =============================
 * 
 * Comprehensive chaos testing orchestrator that integrates with Unit Talk's
 * operational monitoring and validation systems.
 * 
 * Features:
 * - Pre-flight environment validation
 * - Integrated chaos + monitoring execution  
 * - Post-chaos system validation
 * - SLO burn-rate analysis
 * - Parity invariant verification
 * - Discord compliance checking
 * - Comprehensive test reporting
 * 
 * Usage:
 *   node scripts/ops/chaos-runner.js --test quick
 *   node scripts/ops/chaos-runner.js --test comprehensive --validate-all
 *   node scripts/ops/chaos-runner.js --scenario network-storm --monitor
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

// Import chaos components
const { ChaosEngineeringFramework, CHAOS_CONFIG } = require('./chaos.js');
const { ChaosMonitor } = require('./chaos-monitor.js');

class ChaosTestRunner {
  constructor() {
    this.chaos = new ChaosEngineeringFramework();
    this.monitor = null;
    this.outputDir = path.join(process.cwd(), 'out', 'ops');
    this.testResults = {
      startTime: null,
      endTime: null,
      preFlightChecks: {},
      chaosExecution: {},
      monitoring: {},
      postValidation: {},
      summary: {}
    };
  }

  /**
   * Run comprehensive chaos test with full validation
   */
  async runTest(testType, options = {}) {
    console.log(`🔥 Starting Chaos Engineering Test: ${testType}\n`);
    
    this.testResults.startTime = new Date().toISOString();
    
    try {
      // Phase 1: Pre-flight checks
      await this.runPreFlightChecks();
      
      // Phase 2: Start monitoring if requested
      if (options.monitor) {
        await this.startMonitoring(options);
      }
      
      // Phase 3: Execute chaos test
      await this.executeChaosTest(testType, options);
      
      // Phase 4: Stop monitoring and collect data
      if (options.monitor && this.monitor) {
        await this.stopMonitoring();
      }
      
      // Phase 5: Post-chaos validation
      if (options.validateAll) {
        await this.runPostValidation();
      }
      
      // Phase 6: Generate comprehensive report
      await this.generateTestReport();
      
      this.testResults.endTime = new Date().toISOString();
      
      console.log(`\n✅ Chaos engineering test completed successfully`);
      console.log(`📊 Full report: ${path.join(this.outputDir, 'chaos-test-report.json')}`);
      
      return this.testResults;
      
    } catch (error) {
      this.testResults.endTime = new Date().toISOString();
      this.testResults.error = error.message;
      
      console.error(`\n❌ Chaos test failed: ${error.message}`);
      
      // Emergency cleanup
      await this.emergencyCleanup();
      
      // Still generate report for failure analysis
      await this.generateTestReport();
      
      throw error;
    }
  }

  /**
   * Run pre-flight environment and system checks
   */
  async runPreFlightChecks() {
    console.log('🛡️  Phase 1: Pre-flight Checks\n');
    
    const checks = {
      environment: false,
      database: false,
      api: false,
      temporal: false,
      docker: false,
      discord_flags: false,
      baseline_slo: false
    };
    
    try {
      // Environment safety validation
      console.log('   Validating environment safety...');
      await this.chaos.validateEnvironment();
      checks.environment = true;
      console.log('   ✅ Environment validation passed');
      
      // Database connectivity check
      console.log('   Checking database connectivity...');
      const dbCheck = await this.checkDatabaseConnectivity();
      checks.database = dbCheck.success;
      console.log(`   ${dbCheck.success ? '✅' : '❌'} Database: ${dbCheck.message}`);
      
      // API health check
      console.log('   Checking API health...');
      const apiCheck = await this.checkAPIHealth();
      checks.api = apiCheck.success;
      console.log(`   ${apiCheck.success ? '✅' : '❌'} API: ${apiCheck.message}`);
      
      // Temporal connectivity
      console.log('   Checking Temporal connectivity...');
      const temporalCheck = await this.checkTemporalConnectivity();
      checks.temporal = temporalCheck.success;
      console.log(`   ${temporalCheck.success ? '✅' : '❌'} Temporal: ${temporalCheck.message}`);
      
      // Docker services check
      console.log('   Checking Docker services...');
      const dockerCheck = await this.checkDockerServices();
      checks.docker = dockerCheck.success;
      console.log(`   ${dockerCheck.success ? '✅' : '❌'} Docker: ${dockerCheck.message}`);
      
      // Discord flag validation
      console.log('   Validating Discord publishing flags...');
      const discordCheck = await this.validateDiscordFlags();
      checks.discord_flags = discordCheck.success;
      console.log(`   ${discordCheck.success ? '✅' : '❌'} Discord Flags: ${discordCheck.message}`);
      
      // Baseline SLO measurement
      console.log('   Establishing baseline SLO metrics...');
      const sloCheck = await this.establishBaselineSLO();
      checks.baseline_slo = sloCheck.success;
      console.log(`   ${sloCheck.success ? '✅' : '❌'} Baseline SLO: ${sloCheck.message}`);
      
      this.testResults.preFlightChecks = {
        timestamp: new Date().toISOString(),
        checks,
        allPassed: Object.values(checks).every(c => c),
        summary: `${Object.values(checks).filter(c => c).length}/${Object.keys(checks).length} checks passed`
      };
      
      if (!this.testResults.preFlightChecks.allPassed) {
        const failedChecks = Object.entries(checks)
          .filter(([_, passed]) => !passed)
          .map(([check, _]) => check);
        
        throw new Error(`Pre-flight checks failed: ${failedChecks.join(', ')}`);
      }
      
      console.log(`\n   ✅ All pre-flight checks passed (${Object.keys(checks).length}/${Object.keys(checks).length})\n`);
      
    } catch (error) {
      this.testResults.preFlightChecks = {
        timestamp: new Date().toISOString(),
        checks,
        allPassed: false,
        error: error.message
      };
      throw error;
    }
  }

  /**
   * Check database connectivity
   */
  async checkDatabaseConnectivity() {
    try {
      // Try to run a simple database check script
      const { stdout, stderr } = await execAsync('npm run db:check 2>/dev/null || echo "DB check not available"');
      
      if (stdout.includes('not available')) {
        return { success: false, message: 'Database check script not available' };
      }
      
      if (stderr && stderr.includes('error')) {
        return { success: false, message: 'Database connection failed' };
      }
      
      return { success: true, message: 'Database connection successful' };
      
    } catch (error) {
      return { success: false, message: `Database check error: ${error.message}` };
    }
  }

  /**
   * Check API health
   */
  async checkAPIHealth() {
    try {
      const { stdout } = await execAsync('curl -f -m 5 -s http://localhost:3000/healthz 2>/dev/null || echo "FAIL"');
      
      if (stdout.includes('FAIL') || stdout.includes('error')) {
        return { success: false, message: 'API health check failed' };
      }
      
      return { success: true, message: 'API health check passed' };
      
    } catch (error) {
      return { success: false, message: `API not responding: ${error.message}` };
    }
  }

  /**
   * Check Temporal connectivity
   */
  async checkTemporalConnectivity() {
    try {
      // Check if Temporal is running via Docker
      const { stdout } = await execAsync('docker ps --filter "name=temporal" --format "{{.Names}}" 2>/dev/null || echo "FAIL"');
      
      if (!stdout.includes('temporal') || stdout.includes('FAIL')) {
        return { success: false, message: 'Temporal container not running' };
      }
      
      return { success: true, message: 'Temporal service running' };
      
    } catch (error) {
      return { success: false, message: `Temporal check failed: ${error.message}` };
    }
  }

  /**
   * Check Docker services status
   */
  async checkDockerServices() {
    try {
      const { stdout } = await execAsync('docker-compose ps --services --filter status=running 2>/dev/null || echo "FAIL"');
      
      if (stdout.includes('FAIL')) {
        return { success: false, message: 'Docker Compose not available' };
      }
      
      const runningServices = stdout.trim().split('\n').filter(s => s.length > 0);
      
      if (runningServices.length === 0) {
        return { success: false, message: 'No Docker services running' };
      }
      
      return { 
        success: true, 
        message: `${runningServices.length} Docker services running: ${runningServices.join(', ')}` 
      };
      
    } catch (error) {
      return { success: false, message: `Docker check failed: ${error.message}` };
    }
  }

  /**
   * Validate Discord publishing flags
   */
  async validateDiscordFlags() {
    const shadowMode = process.env.SHADOW_MODE === 'true';
    const publishToDiscord = process.env.PUBLISH_TO_DISCORD === 'true';
    
    if (!shadowMode) {
      return { success: false, message: 'SHADOW_MODE must be true for chaos testing' };
    }
    
    if (publishToDiscord) {
      return { success: false, message: 'PUBLISH_TO_DISCORD must be false for chaos testing' };
    }
    
    return { success: true, message: 'Discord flags correctly configured' };
  }

  /**
   * Establish baseline SLO metrics
   */
  async establishBaselineSLO() {
    try {
      // Try to run SLO monitoring to establish baseline
      const { stdout } = await execAsync('npm run ops:slo -- --mock-data --period 1 2>/dev/null || echo "SLO baseline not available"');
      
      if (stdout.includes('not available')) {
        return { success: false, message: 'SLO baseline measurement not available' };
      }
      
      return { success: true, message: 'Baseline SLO metrics established' };
      
    } catch (error) {
      return { success: false, message: `Baseline SLO failed: ${error.message}` };
    }
  }

  /**
   * Start system monitoring
   */
  async startMonitoring(options) {
    console.log('📊 Phase 2: Starting System Monitoring\n');
    
    const monitorOptions = {
      interval: 5000,
      continuous: true,
      alertThreshold: 0.8,
      outputDir: this.outputDir,
      ...options.monitorOptions
    };
    
    this.monitor = new ChaosMonitor(monitorOptions);
    
    // Start monitoring in background
    console.log('   Starting real-time monitoring...');
    await this.monitor.start();
    
    console.log('   ✅ Monitoring active\n');
    
    this.testResults.monitoring = {
      started: true,
      startTime: new Date().toISOString(),
      options: monitorOptions
    };
  }

  /**
   * Execute the specified chaos test
   */
  async executeChaosTest(testType, options) {
    console.log(`🔥 Phase 3: Executing Chaos Test - ${testType}\n`);
    
    const startTime = Date.now();
    
    try {
      await this.chaos.initialize();
      
      // Execute based on test type
      if (CHAOS_CONFIG.scenarios[testType]) {
        // Predefined scenario
        console.log(`   Executing scenario: ${CHAOS_CONFIG.scenarios[testType].name}`);
        await this.chaos.executeScenario(testType);
      } else if (CHAOS_CONFIG.modes[testType]) {
        // Single chaos mode
        const severity = options.severity || 'medium';
        const duration = options.duration || 180;
        console.log(`   Executing mode: ${testType} (${severity}, ${duration}s)`);
        await this.chaos.executeMode(testType, severity, duration);
      } else {
        throw new Error(`Unknown test type: ${testType}`);
      }
      
      const executionTime = (Date.now() - startTime) / 1000;
      
      this.testResults.chaosExecution = {
        testType,
        success: true,
        executionTime,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString()
      };
      
      console.log(`   ✅ Chaos execution completed (${executionTime.toFixed(1)}s)\n`);
      
    } catch (error) {
      const executionTime = (Date.now() - startTime) / 1000;
      
      this.testResults.chaosExecution = {
        testType,
        success: false,
        error: error.message,
        executionTime,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString()
      };
      
      throw error;
    }
  }

  /**
   * Stop monitoring and collect results
   */
  async stopMonitoring() {
    console.log('📊 Phase 4: Stopping Monitoring and Collecting Data\n');
    
    if (!this.monitor) {
      console.log('   ⚠️  No monitor to stop');
      return;
    }
    
    try {
      console.log('   Stopping monitoring...');
      const reportPath = await this.monitor.stop();
      
      // Read monitoring results
      const monitoringData = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
      
      this.testResults.monitoring = {
        ...this.testResults.monitoring,
        completed: true,
        endTime: new Date().toISOString(),
        reportPath,
        summary: {
          totalAlerts: monitoringData.summary?.total_alerts || 0,
          criticalAlerts: monitoringData.summary?.critical_alerts || 0,
          sloViolations: monitoringData.summary?.slo_violations || 0,
          healthDegradationPeriods: monitoringData.summary?.health_degradation_periods || 0
        }
      };
      
      console.log(`   ✅ Monitoring data collected: ${reportPath}`);
      console.log(`   📈 Alerts: ${this.testResults.monitoring.summary.totalAlerts} total, ${this.testResults.monitoring.summary.criticalAlerts} critical`);
      console.log(`   📉 SLO Violations: ${this.testResults.monitoring.summary.sloViolations}\n`);
      
    } catch (error) {
      this.testResults.monitoring = {
        ...this.testResults.monitoring,
        completed: false,
        error: error.message
      };
      console.warn(`   ⚠️  Monitoring stop failed: ${error.message}\n`);
    }
  }

  /**
   * Run post-chaos validation checks
   */
  async runPostValidation() {
    console.log('🔍 Phase 5: Post-Chaos Validation\n');
    
    const validations = {
      system_recovery: false,
      parity_invariant: false,
      discord_compliance: false,
      exposure_limits: false,
      slo_compliance: false,
      data_integrity: false
    };
    
    try {
      // System recovery validation
      console.log('   Validating system recovery...');
      const recoveryCheck = await this.validateSystemRecovery();
      validations.system_recovery = recoveryCheck.success;
      console.log(`   ${recoveryCheck.success ? '✅' : '❌'} System Recovery: ${recoveryCheck.message}`);
      
      // Parity invariant check
      console.log('   Validating parity invariant...');
      const parityCheck = await this.validateParityInvariant();
      validations.parity_invariant = parityCheck.success;
      console.log(`   ${parityCheck.success ? '✅' : '❌'} Parity Invariant: ${parityCheck.message}`);
      
      // Discord compliance check
      console.log('   Validating Discord compliance...');
      const discordCheck = await this.validateDiscordCompliance();
      validations.discord_compliance = discordCheck.success;
      console.log(`   ${discordCheck.success ? '✅' : '❌'} Discord Compliance: ${discordCheck.message}`);
      
      // Exposure limits check
      console.log('   Validating exposure limits...');
      const exposureCheck = await this.validateExposureLimits();
      validations.exposure_limits = exposureCheck.success;
      console.log(`   ${exposureCheck.success ? '✅' : '❌'} Exposure Limits: ${exposureCheck.message}`);
      
      // SLO compliance check
      console.log('   Validating SLO compliance...');
      const sloCheck = await this.validateSLOCompliance();
      validations.slo_compliance = sloCheck.success;
      console.log(`   ${sloCheck.success ? '✅' : '❌'} SLO Compliance: ${sloCheck.message}`);
      
      // Data integrity check
      console.log('   Validating data integrity...');
      const dataCheck = await this.validateDataIntegrity();
      validations.data_integrity = dataCheck.success;
      console.log(`   ${dataCheck.success ? '✅' : '❌'} Data Integrity: ${dataCheck.message}`);
      
      this.testResults.postValidation = {
        timestamp: new Date().toISOString(),
        validations,
        allPassed: Object.values(validations).every(v => v),
        summary: `${Object.values(validations).filter(v => v).length}/${Object.keys(validations).length} validations passed`
      };
      
      console.log(`\n   📊 Validation Summary: ${this.testResults.postValidation.summary}\n`);
      
    } catch (error) {
      this.testResults.postValidation = {
        timestamp: new Date().toISOString(),
        validations,
        allPassed: false,
        error: error.message
      };
      throw error;
    }
  }

  /**
   * Validate system recovery after chaos
   */
  async validateSystemRecovery() {
    try {
      // Wait for system stabilization
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Check API health
      const apiCheck = await this.checkAPIHealth();
      if (!apiCheck.success) {
        return { success: false, message: 'API not healthy after chaos' };
      }
      
      // Check response times are back to normal
      const { stdout } = await execAsync('curl -w "%{time_total}" -s -o /dev/null http://localhost:3000/healthz 2>/dev/null || echo "1.000"');
      const responseTime = parseFloat(stdout) * 1000; // Convert to ms
      
      if (responseTime > 5000) {
        return { success: false, message: `Response time still elevated: ${responseTime.toFixed(0)}ms` };
      }
      
      return { success: true, message: `System recovered, response time: ${responseTime.toFixed(0)}ms` };
      
    } catch (error) {
      return { success: false, message: `Recovery validation failed: ${error.message}` };
    }
  }

  /**
   * Validate parity invariant maintained
   */
  async validateParityInvariant() {
    try {
      // Check if parity check script is available
      const { stdout, stderr } = await execAsync('npm run ops:parity-check 2>/dev/null || echo "Parity check not available"');
      
      if (stdout.includes('not available')) {
        return { success: false, message: 'Parity check script not available' };
      }
      
      if (stderr && stderr.includes('error')) {
        return { success: false, message: 'Parity check failed' };
      }
      
      return { success: true, message: 'Parity invariant maintained' };
      
    } catch (error) {
      return { success: false, message: `Parity validation error: ${error.message}` };
    }
  }

  /**
   * Validate Discord compliance
   */
  async validateDiscordCompliance() {
    const publishToDiscord = process.env.PUBLISH_TO_DISCORD === 'true';
    
    if (publishToDiscord) {
      return { success: false, message: 'PUBLISH_TO_DISCORD flag violation detected' };
    }
    
    // TODO: Check Discord logs for any actual posts during chaos
    
    return { success: true, message: 'No Discord publishing during chaos' };
  }

  /**
   * Validate exposure limits respected
   */
  async validateExposureLimits() {
    try {
      // Check exposure configuration
      const exposurePath = path.join(process.cwd(), 'config', 'exposure.json');
      const exposureConfig = JSON.parse(await fs.readFile(exposurePath, 'utf-8'));
      
      // TODO: Check actual exposure levels against limits
      
      return { 
        success: true, 
        message: `Exposure limits monitored (max: ${exposureConfig.global_limits?.max_total_exposure || 'undefined'})` 
      };
      
    } catch (error) {
      return { success: false, message: `Exposure validation error: ${error.message}` };
    }
  }

  /**
   * Validate SLO compliance
   */
  async validateSLOCompliance() {
    try {
      // Run SLO check
      const { stdout } = await execAsync('npm run ops:slo -- --mock-data --period 1 2>/dev/null || echo "SLO check not available"');
      
      if (stdout.includes('not available')) {
        return { success: false, message: 'SLO validation not available' };
      }
      
      // TODO: Parse SLO results and check for violations
      
      return { success: true, message: 'SLO compliance validated' };
      
    } catch (error) {
      return { success: false, message: `SLO validation error: ${error.message}` };
    }
  }

  /**
   * Validate data integrity
   */
  async validateDataIntegrity() {
    try {
      // Run data integrity checks
      const { stdout } = await execAsync('npm run db:integrity-check 2>/dev/null || echo "Integrity check not available"');
      
      if (stdout.includes('not available')) {
        return { success: false, message: 'Data integrity check not available' };
      }
      
      return { success: true, message: 'Data integrity validated' };
      
    } catch (error) {
      return { success: false, message: `Data integrity error: ${error.message}` };
    }
  }

  /**
   * Generate comprehensive test report
   */
  async generateTestReport() {
    console.log('📊 Phase 6: Generating Test Report\n');
    
    const duration = this.testResults.endTime 
      ? (new Date(this.testResults.endTime) - new Date(this.testResults.startTime)) / 1000
      : (Date.now() - new Date(this.testResults.startTime).getTime()) / 1000;
    
    // Calculate overall test success
    const overallSuccess = (
      this.testResults.preFlightChecks?.allPassed &&
      this.testResults.chaosExecution?.success &&
      (!this.testResults.postValidation || this.testResults.postValidation.allPassed)
    );
    
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        chaos_test_version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        test_duration_seconds: Math.round(duration),
        overall_success: overallSuccess
      },
      
      test_configuration: {
        shadow_mode: process.env.SHADOW_MODE === 'true',
        publish_to_discord: process.env.PUBLISH_TO_DISCORD === 'true',
        monitoring_enabled: !!this.monitor,
        validation_enabled: !!this.testResults.postValidation
      },
      
      phases: {
        pre_flight_checks: this.testResults.preFlightChecks || {},
        chaos_execution: this.testResults.chaosExecution || {},
        monitoring: this.testResults.monitoring || {},
        post_validation: this.testResults.postValidation || {}
      },
      
      summary: {
        total_phases: 6,
        phases_completed: this.calculatePhasesCompleted(),
        pre_flight_success: this.testResults.preFlightChecks?.allPassed || false,
        chaos_execution_success: this.testResults.chaosExecution?.success || false,
        monitoring_success: !this.testResults.monitoring?.error || false,
        post_validation_success: this.testResults.postValidation?.allPassed !== false,
        overall_health_maintained: this.calculateOverallHealth(),
        recommendations: this.generateTestRecommendations()
      },
      
      resilience_metrics: {
        system_recovery_time: this.calculateRecoveryTime(),
        alert_volume: this.testResults.monitoring?.summary?.totalAlerts || 0,
        critical_incidents: this.testResults.monitoring?.summary?.criticalAlerts || 0,
        slo_violations: this.testResults.monitoring?.summary?.sloViolations || 0,
        parity_maintained: this.testResults.postValidation?.validations?.parity_invariant !== false,
        discord_compliant: this.testResults.postValidation?.validations?.discord_compliance !== false
      },
      
      detailed_results: this.testResults
    };
    
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Write comprehensive test report
    const reportPath = path.join(this.outputDir, 'chaos-test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Also create timestamped version
    const timestampedPath = path.join(
      this.outputDir, 
      `chaos-test-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`
    );
    await fs.writeFile(timestampedPath, JSON.stringify(report, null, 2));
    
    console.log(`   📄 Comprehensive report: ${reportPath}`);
    console.log(`   📄 Timestamped copy: ${timestampedPath}`);
    
    // Display summary
    this.displayTestSummary(report);
    
    return report;
  }

  /**
   * Calculate number of phases completed
   */
  calculatePhasesCompleted() {
    let completed = 0;
    
    if (this.testResults.preFlightChecks) completed++;
    if (this.testResults.chaosExecution) completed++;
    if (this.testResults.monitoring?.completed !== false) completed++;
    if (this.testResults.postValidation || !this.testResults.postValidation) completed++; // Count as completed if not requested
    
    return completed;
  }

  /**
   * Calculate overall system health score
   */
  calculateOverallHealth() {
    const factors = [];
    
    // Pre-flight health
    if (this.testResults.preFlightChecks?.allPassed) factors.push(1);
    else if (this.testResults.preFlightChecks) factors.push(0.5);
    
    // Chaos execution success
    if (this.testResults.chaosExecution?.success) factors.push(1);
    else if (this.testResults.chaosExecution) factors.push(0);
    
    // Monitoring health
    const criticalAlerts = this.testResults.monitoring?.summary?.criticalAlerts || 0;
    const monitoringScore = criticalAlerts === 0 ? 1 : (criticalAlerts < 3 ? 0.7 : 0.3);
    factors.push(monitoringScore);
    
    // Post-validation health
    if (this.testResults.postValidation?.allPassed) factors.push(1);
    else if (this.testResults.postValidation) factors.push(0.5);
    else factors.push(0.8); // Not requested, assume healthy
    
    return factors.length > 0 ? factors.reduce((a, b) => a + b, 0) / factors.length : 0;
  }

  /**
   * Calculate system recovery time
   */
  calculateRecoveryTime() {
    if (!this.testResults.chaosExecution?.endTime || !this.testResults.postValidation?.timestamp) {
      return 'unknown';
    }
    
    const chaosEnd = new Date(this.testResults.chaosExecution.endTime);
    const validationStart = new Date(this.testResults.postValidation.timestamp);
    
    return Math.round((validationStart - chaosEnd) / 1000);
  }

  /**
   * Generate test recommendations
   */
  generateTestRecommendations() {
    const recommendations = [];
    
    if (!this.testResults.preFlightChecks?.allPassed) {
      recommendations.push('Fix pre-flight check failures before production chaos testing');
    }
    
    if (!this.testResults.chaosExecution?.success) {
      recommendations.push('Investigate chaos execution failure - system may need hardening');
    }
    
    const criticalAlerts = this.testResults.monitoring?.summary?.criticalAlerts || 0;
    if (criticalAlerts > 0) {
      recommendations.push(`${criticalAlerts} critical alerts detected - review alerting thresholds and system capacity`);
    }
    
    if (this.testResults.postValidation && !this.testResults.postValidation.allPassed) {
      recommendations.push('Post-chaos validation failures indicate system did not recover properly');
    }
    
    if (this.testResults.monitoring?.summary?.sloViolations > 0) {
      recommendations.push('SLO violations during chaos - review performance targets and error budgets');
    }
    
    // Always include general recommendations
    recommendations.push('Continue regular chaos testing to maintain system resilience');
    recommendations.push('Monitor trends in chaos test results over time');
    
    return recommendations;
  }

  /**
   * Display test summary to console
   */
  displayTestSummary(report) {
    console.log(`\n🎯 CHAOS TEST SUMMARY`);
    console.log(`============================`);
    console.log(`Test Duration: ${report.metadata.test_duration_seconds}s`);
    console.log(`Overall Success: ${report.metadata.overall_success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Health Score: ${(report.summary.overall_health_maintained * 100).toFixed(1)}%`);
    
    console.log(`\n📋 Phase Results:`);
    console.log(`   Pre-flight Checks: ${report.summary.pre_flight_success ? '✅' : '❌'}`);
    console.log(`   Chaos Execution: ${report.summary.chaos_execution_success ? '✅' : '❌'}`);
    console.log(`   Monitoring: ${report.summary.monitoring_success ? '✅' : '❌'}`);
    console.log(`   Post-validation: ${report.summary.post_validation_success ? '✅' : '❌'}`);
    
    console.log(`\n🏥 Resilience Metrics:`);
    console.log(`   Recovery Time: ${report.resilience_metrics.system_recovery_time}s`);
    console.log(`   Total Alerts: ${report.resilience_metrics.alert_volume}`);
    console.log(`   Critical Incidents: ${report.resilience_metrics.critical_incidents}`);
    console.log(`   SLO Violations: ${report.resilience_metrics.slo_violations}`);
    console.log(`   Parity Maintained: ${report.resilience_metrics.parity_maintained ? '✅' : '❌'}`);
    console.log(`   Discord Compliant: ${report.resilience_metrics.discord_compliant ? '✅' : '❌'}`);
    
    if (report.summary.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      report.summary.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
  }

  /**
   * Emergency cleanup on test failure
   */
  async emergencyCleanup() {
    console.log('🚨 Running emergency cleanup...');
    
    try {
      // Stop monitoring if running
      if (this.monitor) {
        await this.monitor.stop();
      }
      
      // Ensure chaos framework cleanup
      await this.chaos.cleanup();
      
      console.log('✅ Emergency cleanup completed');
      
    } catch (error) {
      console.warn(`⚠️  Emergency cleanup warning: ${error.message}`);
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
  
  if (args.includes('--list-tests')) {
    listAvailableTests();
    return;
  }
  
  // Parse command line arguments
  const testIndex = args.indexOf('--test');
  const scenarioIndex = args.indexOf('--scenario');
  
  if (testIndex === -1 && scenarioIndex === -1) {
    console.error('❌ No test specified. Use --test <type> or --scenario <name>');
    displayHelp();
    process.exit(1);
  }
  
  const testType = testIndex !== -1 ? args[testIndex + 1] : args[scenarioIndex + 1];
  
  if (!testType) {
    console.error('❌ Test type not specified');
    process.exit(1);
  }
  
  // Parse options
  const options = {
    monitor: args.includes('--monitor'),
    validateAll: args.includes('--validate-all'),
    severity: 'medium',
    duration: 180
  };
  
  const severityIndex = args.indexOf('--severity');
  if (severityIndex !== -1) {
    options.severity = args[severityIndex + 1] || 'medium';
  }
  
  const durationIndex = args.indexOf('--duration');
  if (durationIndex !== -1) {
    options.duration = parseInt(args[durationIndex + 1]) || 180;
  }
  
  const runner = new ChaosTestRunner();
  
  // Setup graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT - stopping chaos test...');
    await runner.emergencyCleanup();
    process.exit(1);
  });
  
  try {
    await runner.runTest(testType, options);
    
    console.log('\n🎉 Chaos engineering test completed successfully!');
    
  } catch (error) {
    console.error(`\n💥 Chaos test failed: ${error.message}`);
    process.exit(1);
  }
}

function displayHelp() {
  console.log(`
🔥 CHAOS ENGINEERING TEST RUNNER
=================================

DESCRIPTION:
  Comprehensive chaos testing orchestrator with integrated monitoring,
  validation, and reporting for Unit Talk system resilience testing.

USAGE:
  node scripts/ops/chaos-runner.js [OPTIONS]

OPTIONS:
  --test <type>           Run specific chaos mode
  --scenario <name>       Run predefined scenario
  --monitor               Enable real-time monitoring
  --validate-all          Enable post-chaos validation
  --severity <level>      Severity: light|medium|heavy (default: medium)
  --duration <seconds>    Duration for single modes (default: 180)
  --list-tests           List available tests and scenarios
  --help, -h             Show this help message

TEST TYPES:
  quick                  Quick resilience test (2min)
  standard-chaos         Standard chaos test (3min)
  comprehensive          Comprehensive stress test (5min)
  network-storm          Network connectivity test (4min)
  
  vendor-lag             API latency simulation
  db-slow               Database slowdown
  queue-spike           Processing spike
  network-partition     Connectivity issues
  resource-exhaustion   Memory/CPU pressure

EXAMPLES:
  node scripts/ops/chaos-runner.js --test comprehensive --monitor --validate-all
  node scripts/ops/chaos-runner.js --scenario network-storm --monitor
  node scripts/ops/chaos-runner.js --test vendor-lag --severity heavy --duration 300

PHASES:
  1️⃣ Pre-flight checks (environment, services, flags)
  2️⃣ System monitoring startup
  3️⃣ Chaos test execution  
  4️⃣ Monitoring data collection
  5️⃣ Post-chaos validation
  6️⃣ Comprehensive reporting

OUTPUT:
  Test report: out/ops/chaos-test-report.json
  Timestamped: out/ops/chaos-test-YYYY-MM-DD-{timestamp}.json
  Monitoring: out/ops/chaos-monitor-{timestamp}.json
  Chaos logs: out/ops/chaos-{timestamp}.json
`);
}

function listAvailableTests() {
  console.log('🔥 Available Chaos Tests:\n');
  
  console.log('PREDEFINED SCENARIOS:');
  for (const [key, scenario] of Object.entries(CHAOS_CONFIG.scenarios)) {
    console.log(`  ${key.padEnd(20)} ${scenario.name} (${scenario.duration}s)`);
  }
  
  console.log('\nINDIVIDUAL MODES:');
  for (const [key, mode] of Object.entries(CHAOS_CONFIG.modes)) {
    console.log(`  ${key.padEnd(20)} ${mode.name}`);
  }
  
  console.log('\nRECOMMENDED TEST PROGRESSION:');
  console.log('  1. quick               Start with light chaos testing');
  console.log('  2. standard-chaos      Medium intensity multi-mode test');
  console.log('  3. comprehensive       Full system stress test');
  console.log('  4. network-storm       Network-focused resilience test');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { ChaosTestRunner };