#!/usr/bin/env tsx
/**
 * Smoke Test Orchestrator
 * Coordinates agent and workflow smoke testing with comprehensive reporting
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import { performance } from 'perf_hooks';

/**
 * Smoke test orchestration configuration
 */
interface SmokeTestConfig {
  runAgents: boolean;
  runWorkflows: boolean;
  generateSummary: boolean;
  parallelExecution: boolean;
  continueOnFailure: boolean;
  outputDirectory: string;
  timeoutMinutes: number;
}

/**
 * Test execution result
 */
interface TestExecutionResult {
  testType: 'agents' | 'workflows' | 'summary';
  success: boolean;
  duration: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * Orchestration summary
 */
interface OrchestrationSummary {
  timestamp: string;
  success: boolean;
  config: SmokeTestConfig;
  results: TestExecutionResult[];
  totalDuration: number;
  environment: {
    shadowMode: boolean;
    dryRun: boolean;
    nodeVersion: string;
    platform: string;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Smoke test orchestrator
 */
class SmokeTestOrchestrator {
  private config: SmokeTestConfig;
  private results: TestExecutionResult[] = [];

  constructor(config: Partial<SmokeTestConfig> = {}) {
    this.config = {
      runAgents: true,
      runWorkflows: true,
      generateSummary: true,
      parallelExecution: true,
      continueOnFailure: true,
      outputDirectory: 'out/smoke',
      timeoutMinutes: 10,
      ...config,
    };
  }

  /**
   * Execute all smoke tests
   */
  async execute(): Promise<OrchestrationSummary> {
    const startTime = performance.now();
    
    console.log('🚀 Starting comprehensive smoke test suite...');
    console.log(`Configuration: Agents=${this.config.runAgents}, Workflows=${this.config.runWorkflows}, Parallel=${this.config.parallelExecution}`);

    try {
      if (this.config.parallelExecution) {
        await this.executeParallel();
      } else {
        await this.executeSequential();
      }

      // Generate summary if requested
      if (this.config.generateSummary) {
        await this.generateSummary();
      }

    } catch (error) {
      console.error('❌ Smoke test orchestration failed:', error);
    }

    const totalDuration = performance.now() - startTime;
    
    return this.createSummary(totalDuration);
  }

  /**
   * Execute tests in parallel
   */
  private async executeParallel(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.runAgents) {
      promises.push(this.runAgentTests());
    }

    if (this.config.runWorkflows) {
      promises.push(this.runWorkflowTests());
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Execute tests sequentially
   */
  private async executeSequential(): Promise<void> {
    if (this.config.runAgents) {
      await this.runAgentTests();
      
      // Stop if agents failed and continueOnFailure is false
      const agentResult = this.results.find(r => r.testType === 'agents');
      if (!this.config.continueOnFailure && agentResult && !agentResult.success) {
        console.log('⏹️  Stopping due to agent test failures');
        return;
      }
    }

    if (this.config.runWorkflows) {
      await this.runWorkflowTests();
    }
  }

  /**
   * Run agent smoke tests
   */
  private async runAgentTests(): Promise<void> {
    console.log('\n🤖 Executing agent smoke tests...');
    
    const result = await this.executeScript(
      'agents',
      path.join(process.cwd(), 'scripts', 'agents', 'smoke-runner.ts')
    );
    
    this.results.push(result);
    
    if (result.success) {
      console.log('✅ Agent smoke tests completed successfully');
    } else {
      console.log('❌ Agent smoke tests failed');
      if (result.stderr) {
        console.log('Error output:', result.stderr);
      }
    }
  }

  /**
   * Run workflow smoke tests
   */
  private async runWorkflowTests(): Promise<void> {
    console.log('\n🔄 Executing workflow smoke tests...');
    
    const result = await this.executeScript(
      'workflows',
      path.join(process.cwd(), 'scripts', 'workflows', 'smoke-runner.ts')
    );
    
    this.results.push(result);
    
    if (result.success) {
      console.log('✅ Workflow smoke tests completed successfully');
    } else {
      console.log('❌ Workflow smoke tests failed');
      if (result.stderr) {
        console.log('Error output:', result.stderr);
      }
    }
  }

  /**
   * Generate combined summary
   */
  private async generateSummary(): Promise<void> {
    console.log('\n📊 Generating combined smoke test summary...');
    
    const result = await this.executeScript(
      'summary',
      path.join(process.cwd(), 'scripts', 'smoke', 'smoke-summary.ts')
    );
    
    this.results.push(result);
    
    if (result.success) {
      console.log('✅ Smoke test summary generated successfully');
    } else {
      console.log('❌ Smoke test summary generation failed');
      if (result.stderr) {
        console.log('Error output:', result.stderr);
      }
    }
  }

  /**
   * Execute a TypeScript script
   */
  private async executeScript(testType: 'agents' | 'workflows' | 'summary', scriptPath: string): Promise<TestExecutionResult> {
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      const timeoutMs = this.config.timeoutMinutes * 60 * 1000;
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const process = spawn('tsx', [scriptPath], {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill('SIGTERM');
        
        // Force kill if it doesn't respond to SIGTERM
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      }, timeoutMs);

      // Capture output
      process.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        // Also log to console in real-time
        console.log(output.replace(/\n$/, ''));
      });

      process.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        // Also log to console in real-time
        console.error(output.replace(/\n$/, ''));
      });

      process.on('close', (code) => {
        clearTimeout(timeout);
        const duration = performance.now() - startTime;
        
        resolve({
          testType,
          success: code === 0 && !timedOut,
          duration,
          exitCode: code || (timedOut ? -1 : 0),
          stdout,
          stderr: timedOut ? `Process timed out after ${this.config.timeoutMinutes} minutes` : stderr,
          error: timedOut ? 'Timeout' : (code !== 0 ? 'Non-zero exit code' : undefined),
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        const duration = performance.now() - startTime;
        
        resolve({
          testType,
          success: false,
          duration,
          exitCode: -1,
          stdout,
          stderr: error.message,
          error: `Process error: ${error.message}`,
        });
      });
    });
  }

  /**
   * Create orchestration summary
   */
  private createSummary(totalDuration: number): OrchestrationSummary {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Collect errors and warnings from test results
    this.results.forEach(result => {
      if (!result.success) {
        errors.push(`${result.testType} test failed: ${result.error || 'Unknown error'}`);
      }
      
      if (result.stderr && !result.error) {
        warnings.push(`${result.testType} test had warnings: ${result.stderr.slice(0, 200)}`);
      }
    });

    return {
      timestamp: new Date().toISOString(),
      success: this.results.every(r => r.success),
      config: this.config,
      results: this.results,
      totalDuration,
      environment: {
        shadowMode: process.env.SHADOW_MODE !== 'false',
        dryRun: process.env.DRY_RUN !== 'false',
        nodeVersion: process.version,
        platform: process.platform,
      },
      errors,
      warnings,
    };
  }

  /**
   * Print final report
   */
  printReport(summary: OrchestrationSummary): void {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 SMOKE TEST ORCHESTRATION REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📊 Overall Results:`);
    console.log(`  Success: ${summary.success ? '✅' : '❌'}`);
    console.log(`  Total Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`  Environment: ${summary.environment.shadowMode ? 'SHADOW' : 'LIVE'} mode`);
    console.log(`  Platform: ${summary.environment.platform} (Node ${summary.environment.nodeVersion})`);

    console.log(`\n📋 Test Results:`);
    summary.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const duration = (result.duration / 1000).toFixed(2);
      console.log(`  ${result.testType.padEnd(12)} ${status} (${duration}s)`);
      
      if (!result.success && result.error) {
        console.log(`    Error: ${result.error}`);
      }
    });

    if (summary.errors.length > 0) {
      console.log(`\n🚨 Errors (${summary.errors.length}):`);
      summary.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
    }

    if (summary.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${summary.warnings.length}):`);
      summary.warnings.slice(0, 3).forEach(warning => {
        console.log(`  - ${warning}`);
      });
      if (summary.warnings.length > 3) {
        console.log(`  ... and ${summary.warnings.length - 3} more warnings`);
      }
    }

    console.log(`\n📁 Output Directory: ${this.config.outputDirectory}`);
    
    // CI/CD integration guidance
    if (summary.success) {
      console.log('\n🎉 All smoke tests passed! System is ready for integration testing.');
    } else {
      console.log('\n🔧 Some smoke tests failed. Review errors before proceeding to integration testing.');
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<SmokeTestConfig> {
  const args = process.argv.slice(2);
  const config: Partial<SmokeTestConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--no-agents':
        config.runAgents = false;
        break;
      case '--no-workflows':
        config.runWorkflows = false;
        break;
      case '--no-summary':
        config.generateSummary = false;
        break;
      case '--sequential':
        config.parallelExecution = false;
        break;
      case '--fail-fast':
        config.continueOnFailure = false;
        break;
      case '--timeout':
        config.timeoutMinutes = parseInt(args[i + 1], 10) || 10;
        i++; // Skip next arg
        break;
      case '--output-dir':
        config.outputDirectory = args[i + 1] || 'out/smoke';
        i++; // Skip next arg
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
    }
  }

  return config;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Smoke Test Orchestrator - Comprehensive agent and workflow testing

Usage:
  tsx scripts/smoke/smoke-orchestrator.ts [options]

Options:
  --no-agents         Skip agent smoke tests
  --no-workflows      Skip workflow smoke tests
  --no-summary        Skip summary generation
  --sequential        Run tests sequentially instead of parallel
  --fail-fast         Stop on first failure
  --timeout <minutes> Set timeout in minutes (default: 10)
  --output-dir <dir>  Set output directory (default: out/smoke)
  --help              Show this help message

Environment Variables:
  SHADOW_MODE         Run in shadow mode (default: true)
  DRY_RUN             Run in dry run mode (default: true)
  AGENT_PERF_THRESHOLD_MS      Agent performance threshold in ms
  WORKFLOW_PERF_THRESHOLD_MS   Workflow performance threshold in ms

Examples:
  # Run all tests in parallel (default)
  npm run smoke:all

  # Run only agent tests
  tsx scripts/smoke/smoke-orchestrator.ts --no-workflows

  # Run sequentially with fail-fast
  tsx scripts/smoke/smoke-orchestrator.ts --sequential --fail-fast

  # Run with custom timeout
  tsx scripts/smoke/smoke-orchestrator.ts --timeout 15
  `);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Parse command line arguments
    const config = parseArgs();
    
    // Create orchestrator
    const orchestrator = new SmokeTestOrchestrator(config);
    
    // Execute smoke tests
    const summary = await orchestrator.execute();
    
    // Print report
    orchestrator.printReport(summary);
    
    // Exit with appropriate code
    process.exit(summary.success ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Smoke test orchestration failed:', error);
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

export { SmokeTestOrchestrator, type OrchestrationSummary, type TestExecutionResult };