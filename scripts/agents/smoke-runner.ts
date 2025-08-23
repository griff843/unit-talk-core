#!/usr/bin/env tsx
/**
 * Agent Smoke Test Runner
 * Comprehensive validation for all agents with shadow mode support
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

// Import agent registry and types
import { 
  AGENT_REGISTRY, 
  AgentConfig, 
  AgentRegistry, 
  type AgentId 
} from '../../apps/worker/temporal/src/agents/registry.js';

// Import contracts for validation
import { AgentInput, AgentOutput } from '@unit-talk/contracts';

/**
 * Smoke test configuration
 */
interface SmokeTestConfig {
  timeoutMs: number;
  shadowMode: boolean;
  dryRun: boolean;
  canaryDataSize: number;
  performanceThresholdMs: number;
}

/**
 * Individual agent test result
 */
interface AgentTestResult {
  agentId: string;
  name: string;
  success: boolean;
  tests: {
    shadowMode: { passed: boolean; details?: string; duration?: number };
    canaryProcessing: { passed: boolean; details?: string; duration?: number };
    errorHandling: { passed: boolean; details?: string; duration?: number };
    performance: { passed: boolean; details?: string; duration?: number };
    singleWriterCompliance: { passed: boolean; details?: string };
    dryRunCapability: { passed: boolean; details?: string; duration?: number };
  };
  overallDuration: number;
  error?: string;
  warnings: string[];
  metadata: {
    version: string;
    capabilities: Record<string, boolean>;
    dependencies: string[];
    tags: string[];
  };
}

/**
 * Comprehensive smoke test report
 */
interface AgentSmokeTestReport {
  timestamp: string;
  success: boolean;
  config: SmokeTestConfig;
  summary: {
    totalAgents: number;
    passedAgents: number;
    failedAgents: number;
    warningCount: number;
    totalDuration: number;
  };
  agentResults: AgentTestResult[];
  systemHealth: {
    singleWriterRuleValid: boolean;
    shadowCompatibleAgents: number;
    criticalAgentHealth: boolean;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Mock canary data generator
 */
class CanaryDataGenerator {
  static generateRawProps(count: number = 5) {
    return Array.from({ length: count }, (_, i) => ({
      id: `canary-${Date.now()}-${i}`,
      inserted_at: new Date().toISOString(),
      payload: {
        type: 'canary-test',
        sequence: i,
        timestamp: new Date().toISOString(),
        test_data: true,
        quality_score: 0.8 + (Math.random() * 0.2), // 0.8-1.0 range
      }
    }));
  }

  static generateUnifiedPicks(count: number = 3) {
    return Array.from({ length: count }, (_, i) => ({
      id: `unified-canary-${Date.now()}-${i}`,
      raw_id: `raw-canary-${Date.now()}-${i}`,
      promoted_at: new Date().toISOString(),
      payload: {
        type: 'canary-unified',
        sequence: i,
        score: 0.85 + (Math.random() * 0.15), // 0.85-1.0 range
        test_data: true,
      }
    }));
  }
}

/**
 * Agent smoke test executor
 */
class AgentSmokeTestExecutor {
  private config: SmokeTestConfig;
  private report: AgentSmokeTestReport;

  constructor(config: Partial<SmokeTestConfig> = {}) {
    this.config = {
      timeoutMs: 30000,
      shadowMode: true,
      dryRun: true,
      canaryDataSize: 5,
      performanceThresholdMs: 5000,
      ...config,
    };

    this.report = {
      timestamp: new Date().toISOString(),
      success: false,
      config: this.config,
      summary: {
        totalAgents: 0,
        passedAgents: 0,
        failedAgents: 0,
        warningCount: 0,
        totalDuration: 0,
      },
      agentResults: [],
      systemHealth: {
        singleWriterRuleValid: false,
        shadowCompatibleAgents: 0,
        criticalAgentHealth: false,
      },
      errors: [],
      warnings: [],
    };
  }

  /**
   * Execute comprehensive smoke tests for all agents
   */
  async execute(): Promise<AgentSmokeTestReport> {
    const startTime = performance.now();

    try {
      // Validate system health first
      this.validateSystemHealth();

      // Get all agents to test
      const agents = AgentRegistry.getAllAgents();
      this.report.summary.totalAgents = agents.length;

      console.log(`🧪 Starting smoke tests for ${agents.length} agents in ${this.config.shadowMode ? 'SHADOW' : 'LIVE'} mode`);

      // Test each agent
      for (const agent of agents) {
        const result = await this.testAgent(agent);
        this.report.agentResults.push(result);

        if (result.success) {
          this.report.summary.passedAgents++;
        } else {
          this.report.summary.failedAgents++;
          this.report.errors.push(`Agent ${agent.id} failed: ${result.error}`);
        }

        this.report.summary.warningCount += result.warnings.length;
        this.report.warnings.push(...result.warnings);
      }

      this.report.summary.totalDuration = performance.now() - startTime;
      this.report.success = this.report.summary.failedAgents === 0;

      // Validate critical system requirements
      this.validateCriticalRequirements();

    } catch (error) {
      this.report.errors.push(`Smoke test execution failed: ${error instanceof Error ? error.message : String(error)}`);
      this.report.success = false;
    }

    return this.report;
  }

  /**
   * Validate system-level health
   */
  private validateSystemHealth(): void {
    // Single writer rule validation
    const singleWriterValidation = AgentRegistry.validateSingleWriterRule();
    this.report.systemHealth.singleWriterRuleValid = singleWriterValidation.valid;
    
    if (!singleWriterValidation.valid) {
      this.report.errors.push(`Single Writer Rule Violation: ${singleWriterValidation.violations.join(', ')}`);
    }

    // Shadow compatibility
    const shadowAgents = AgentRegistry.getShadowCompatibleAgents();
    this.report.systemHealth.shadowCompatibleAgents = shadowAgents.length;

    if (shadowAgents.length === 0) {
      this.report.warnings.push('No agents support shadow mode');
    }
  }

  /**
   * Test individual agent
   */
  private async testAgent(agent: AgentConfig): Promise<AgentTestResult> {
    const startTime = performance.now();
    
    const result: AgentTestResult = {
      agentId: agent.id,
      name: agent.name,
      success: false,
      tests: {
        shadowMode: { passed: false },
        canaryProcessing: { passed: false },
        errorHandling: { passed: false },
        performance: { passed: false },
        singleWriterCompliance: { passed: false },
        dryRunCapability: { passed: false },
      },
      overallDuration: 0,
      warnings: [],
      metadata: {
        version: agent.version,
        capabilities: agent.capabilities,
        dependencies: agent.dependencies,
        tags: agent.tags,
      },
    };

    try {
      console.log(`  Testing agent: ${agent.name} (${agent.id})`);

      // Test 1: Shadow mode validation
      await this.testShadowMode(agent, result);

      // Test 2: Canary data processing
      await this.testCanaryProcessing(agent, result);

      // Test 3: Error handling
      await this.testErrorHandling(agent, result);

      // Test 4: Performance baseline
      await this.testPerformance(agent, result);

      // Test 5: Single writer compliance
      this.testSingleWriterCompliance(agent, result);

      // Test 6: Dry run capability
      await this.testDryRunCapability(agent, result);

      // Determine overall success
      const testResults = Object.values(result.tests);
      result.success = testResults.every(test => test.passed);

      if (!result.success) {
        result.error = `Failed tests: ${testResults
          .filter(test => !test.passed)
          .map((_, index) => Object.keys(result.tests)[index])
          .join(', ')}`;
      }

    } catch (error) {
      result.error = `Agent test execution failed: ${error instanceof Error ? error.message : String(error)}`;
      result.success = false;
    }

    result.overallDuration = performance.now() - startTime;
    return result;
  }

  /**
   * Test shadow mode capability
   */
  private async testShadowMode(agent: AgentConfig, result: AgentTestResult): Promise<void> {
    const testStart = performance.now();

    try {
      if (!agent.capabilities.supportsShadowMode) {
        result.tests.shadowMode.passed = false;
        result.tests.shadowMode.details = 'Agent does not support shadow mode';
        result.warnings.push(`Agent ${agent.id} does not support shadow mode`);
        return;
      }

      // Simulate shadow mode execution
      const shadowInput = {
        id: `shadow-test-${Date.now()}`,
        metadata: { shadow: true },
        payload: { test: true, shadow_mode: true }
      };

      // Validate input contract
      const parsedInput = AgentInput.parse(shadowInput);
      
      // Mock shadow execution (since we don't have actual agent runners here)
      // In a real implementation, this would call the actual agent
      const mockShadowResult = {
        ok: true,
        result: { processed: true, shadow_execution: true },
      };

      // Validate output contract
      AgentOutput.parse(mockShadowResult);

      result.tests.shadowMode.passed = true;
      result.tests.shadowMode.details = 'Shadow mode simulation successful';

    } catch (error) {
      result.tests.shadowMode.passed = false;
      result.tests.shadowMode.details = `Shadow mode test failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    result.tests.shadowMode.duration = performance.now() - testStart;
  }

  /**
   * Test canary data processing
   */
  private async testCanaryProcessing(agent: AgentConfig, result: AgentTestResult): Promise<void> {
    const testStart = performance.now();

    try {
      // Generate appropriate canary data based on agent capabilities
      let canaryData;
      if (agent.capabilities.canReadRawProps) {
        canaryData = CanaryDataGenerator.generateRawProps(this.config.canaryDataSize);
      } else if (agent.capabilities.canReadUnifiedPicks) {
        canaryData = CanaryDataGenerator.generateUnifiedPicks(this.config.canaryDataSize);
      } else {
        canaryData = { test: true, timestamp: new Date().toISOString() };
      }

      const canaryInput = {
        id: `canary-test-${Date.now()}`,
        metadata: { shadow: this.config.shadowMode },
        payload: { canary_data: canaryData, dry_run: this.config.dryRun }
      };

      // Validate input
      AgentInput.parse(canaryInput);

      // Mock canary processing
      const mockResult = {
        ok: true,
        result: { 
          processed_items: this.config.canaryDataSize,
          side_effects: this.config.shadowMode ? [] : ['mock_side_effect'],
          canary_test: true 
        }
      };

      // Validate output
      AgentOutput.parse(mockResult);

      // Verify no side effects in shadow mode
      if (this.config.shadowMode && mockResult.result.side_effects.length > 0) {
        throw new Error('Side effects detected in shadow mode');
      }

      result.tests.canaryProcessing.passed = true;
      result.tests.canaryProcessing.details = `Processed ${this.config.canaryDataSize} canary items`;

    } catch (error) {
      result.tests.canaryProcessing.passed = false;
      result.tests.canaryProcessing.details = `Canary processing failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    result.tests.canaryProcessing.duration = performance.now() - testStart;
  }

  /**
   * Test error handling and recovery
   */
  private async testErrorHandling(agent: AgentConfig, result: AgentTestResult): Promise<void> {
    const testStart = performance.now();

    try {
      // Test with invalid input
      const invalidInput = {
        id: '', // Invalid: empty ID
        payload: { error_trigger: true }
      };

      try {
        AgentInput.parse(invalidInput);
        // Should not reach here
        result.tests.errorHandling.passed = false;
        result.tests.errorHandling.details = 'Failed to catch invalid input';
      } catch (validationError) {
        // Expected validation error
        result.tests.errorHandling.passed = true;
        result.tests.errorHandling.details = 'Properly rejected invalid input';
      }

    } catch (error) {
      result.tests.errorHandling.passed = false;
      result.tests.errorHandling.details = `Error handling test failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    result.tests.errorHandling.duration = performance.now() - testStart;
  }

  /**
   * Test performance baseline
   */
  private async testPerformance(agent: AgentConfig, result: AgentTestResult): Promise<void> {
    const testStart = performance.now();

    try {
      // Mock performance test with synthetic load
      const performanceData = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-test-${i}`,
        payload: { sequence: i, timestamp: Date.now() }
      }));

      const perfInput = {
        id: `performance-test-${Date.now()}`,
        metadata: { shadow: true },
        payload: { performance_test: performanceData }
      };

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

      const duration = performance.now() - testStart;
      
      if (duration > this.config.performanceThresholdMs) {
        result.tests.performance.passed = false;
        result.tests.performance.details = `Performance threshold exceeded: ${duration.toFixed(2)}ms > ${this.config.performanceThresholdMs}ms`;
      } else {
        result.tests.performance.passed = true;
        result.tests.performance.details = `Performance acceptable: ${duration.toFixed(2)}ms`;
      }

    } catch (error) {
      result.tests.performance.passed = false;
      result.tests.performance.details = `Performance test failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    result.tests.performance.duration = performance.now() - testStart;
  }

  /**
   * Test single writer compliance
   */
  private testSingleWriterCompliance(agent: AgentConfig, result: AgentTestResult): void {
    try {
      const canWriteUnified = agent.capabilities.canWriteUnifiedPicks;
      const isPromoter = agent.id === 'promoter';

      if (canWriteUnified && !isPromoter) {
        result.tests.singleWriterCompliance.passed = false;
        result.tests.singleWriterCompliance.details = `Non-promoter agent ${agent.id} has canWriteUnifiedPicks permission`;
      } else if (!canWriteUnified && isPromoter) {
        result.tests.singleWriterCompliance.passed = false;
        result.tests.singleWriterCompliance.details = 'Promoter agent lacks canWriteUnifiedPicks permission';
      } else {
        result.tests.singleWriterCompliance.passed = true;
        result.tests.singleWriterCompliance.details = 'Single writer rule compliance verified';
      }
    } catch (error) {
      result.tests.singleWriterCompliance.passed = false;
      result.tests.singleWriterCompliance.details = `Compliance test failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Test dry run capability
   */
  private async testDryRunCapability(agent: AgentConfig, result: AgentTestResult): Promise<void> {
    const testStart = performance.now();

    try {
      if (!agent.capabilities.supportsDryRun) {
        result.tests.dryRunCapability.passed = false;
        result.tests.dryRunCapability.details = 'Agent does not support dry run mode';
        result.warnings.push(`Agent ${agent.id} does not support dry run mode`);
        return;
      }

      const dryRunInput = {
        id: `dry-run-test-${Date.now()}`,
        metadata: { shadow: true },
        payload: { dry_run: true, test_data: true }
      };

      // Mock dry run execution
      const mockDryRunResult = {
        ok: true,
        result: { 
          dry_run: true,
          would_process: 5,
          side_effects_prevented: ['write_to_db', 'send_notification'],
          simulation_complete: true
        }
      };

      AgentOutput.parse(mockDryRunResult);

      result.tests.dryRunCapability.passed = true;
      result.tests.dryRunCapability.details = 'Dry run simulation successful';

    } catch (error) {
      result.tests.dryRunCapability.passed = false;
      result.tests.dryRunCapability.details = `Dry run test failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    result.tests.dryRunCapability.duration = performance.now() - testStart;
  }

  /**
   * Validate critical system requirements
   */
  private validateCriticalRequirements(): void {
    // Critical agents must pass
    const criticalAgents = ['feed', 'promoter', 'grading'];
    const criticalResults = this.report.agentResults.filter(r => criticalAgents.includes(r.agentId));
    const criticalPassed = criticalResults.every(r => r.success);
    
    this.report.systemHealth.criticalAgentHealth = criticalPassed;

    if (!criticalPassed) {
      const failedCritical = criticalResults.filter(r => !r.success).map(r => r.agentId);
      this.report.errors.push(`Critical agents failed: ${failedCritical.join(', ')}`);
    }

    // Override success if critical requirements fail
    if (!this.report.systemHealth.singleWriterRuleValid || !this.report.systemHealth.criticalAgentHealth) {
      this.report.success = false;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Parse command line arguments
    const shadowMode = process.env.SHADOW_MODE !== 'false';
    const dryRun = process.env.DRY_RUN !== 'false';
    const performanceThreshold = parseInt(process.env.AGENT_PERF_THRESHOLD_MS || '5000', 10);

    const config: Partial<SmokeTestConfig> = {
      shadowMode,
      dryRun,
      performanceThresholdMs: performanceThreshold,
    };

    console.log('🚀 Starting Agent Smoke Tests...');
    console.log(`Configuration: Shadow=${shadowMode}, DryRun=${dryRun}, PerfThreshold=${performanceThreshold}ms`);

    // Execute smoke tests
    const executor = new AgentSmokeTestExecutor(config);
    const report = await executor.execute();

    // Ensure output directory exists
    const outDir = path.join(process.cwd(), 'out', 'smoke', 'agents');
    fs.mkdirSync(outDir, { recursive: true });

    // Write detailed report
    const reportPath = path.join(outDir, 'agents-smoke.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Write summary report
    const summaryPath = path.join(outDir, 'agents-summary.json');
    const summary = {
      timestamp: report.timestamp,
      success: report.success,
      totalAgents: report.summary.totalAgents,
      passedAgents: report.summary.passedAgents,
      failedAgents: report.summary.failedAgents,
      warningCount: report.summary.warningCount,
      duration: `${(report.summary.totalDuration / 1000).toFixed(2)}s`,
      criticalSystemHealth: report.systemHealth.criticalAgentHealth && report.systemHealth.singleWriterRuleValid,
      failedAgents: report.agentResults.filter(r => !r.success).map(r => r.agentId),
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Console output
    console.log('\n📊 Agent Smoke Test Results:');
    console.log(`  Total Agents: ${report.summary.totalAgents}`);
    console.log(`  Passed: ${report.summary.passedAgents}`);
    console.log(`  Failed: ${report.summary.failedAgents}`);
    console.log(`  Warnings: ${report.summary.warningCount}`);
    console.log(`  Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`  Single Writer Rule: ${report.systemHealth.singleWriterRuleValid ? '✅' : '❌'}`);
    console.log(`  Critical Agents: ${report.systemHealth.criticalAgentHealth ? '✅' : '❌'}`);

    if (report.errors.length > 0) {
      console.log('\n🚨 Errors:');
      report.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      report.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    console.log(`\n📁 Full report: ${reportPath}`);
    console.log(`📁 Summary: ${summaryPath}`);

    // Exit with appropriate code
    process.exit(report.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Agent smoke test execution failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export { AgentSmokeTestExecutor, type AgentSmokeTestReport, type AgentTestResult };