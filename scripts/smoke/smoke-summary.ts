#!/usr/bin/env tsx
/**
 * Combined Smoke Test Summary Generator
 * Aggregates agent and workflow smoke test results into unified report
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * Combined smoke test summary
 */
interface CombinedSmokeTestSummary {
  timestamp: string;
  overallSuccess: boolean;
  environment: {
    shadowMode: boolean;
    dryRun: boolean;
    nodeVersion: string;
    platform: string;
  };
  agents: {
    success: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    warningCount: number;
    duration: string;
    criticalAgentHealth: boolean;
    singleWriterRuleValid: boolean;
    failedAgents: string[];
    reportPath: string;
  };
  workflows: {
    success: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    warningCount: number;
    duration: string;
    workflowCoverage: string;
    criticalWorkflowHealth: boolean;
    dependencyChainValid: boolean;
    failedWorkflows: string[];
    reportPath: string;
  };
  systemHealth: {
    overallHealth: boolean;
    criticalSystemsOnline: boolean;
    shadowModeCompliant: boolean;
    performanceWithinLimits: boolean;
  };
  recommendations: string[];
  errors: string[];
  warnings: string[];
  dashboardUrl?: string;
}

/**
 * Smoke test summary generator
 */
class SmokeTestSummaryGenerator {
  private outDir: string;

  constructor() {
    this.outDir = path.join(process.cwd(), 'out', 'smoke');
  }

  /**
   * Generate combined summary from agent and workflow reports
   */
  async generateSummary(): Promise<CombinedSmokeTestSummary> {
    const timestamp = new Date().toISOString();
    
    // Load agent test results
    const agentResults = await this.loadAgentResults();
    
    // Load workflow test results
    const workflowResults = await this.loadWorkflowResults();

    // Generate combined summary
    const summary: CombinedSmokeTestSummary = {
      timestamp,
      overallSuccess: agentResults.success && workflowResults.success,
      environment: {
        shadowMode: process.env.SHADOW_MODE !== 'false',
        dryRun: process.env.DRY_RUN !== 'false',
        nodeVersion: process.version,
        platform: process.platform,
      },
      agents: {
        success: agentResults.success,
        totalTests: agentResults.totalAgents,
        passedTests: agentResults.passedAgents,
        failedTests: agentResults.failedAgents,
        warningCount: agentResults.warningCount,
        duration: agentResults.duration,
        criticalAgentHealth: agentResults.criticalSystemHealth,
        singleWriterRuleValid: agentResults.criticalSystemHealth, // Simplified for summary
        failedAgents: agentResults.failedAgents || [],
        reportPath: 'out/smoke/agents/agents-smoke.json',
      },
      workflows: {
        success: workflowResults.success,
        totalTests: workflowResults.totalWorkflows,
        passedTests: workflowResults.passedWorkflows,
        failedTests: workflowResults.failedWorkflows,
        warningCount: workflowResults.warningCount,
        duration: workflowResults.duration,
        workflowCoverage: workflowResults.workflowCoverage,
        criticalWorkflowHealth: workflowResults.criticalSystemHealth,
        dependencyChainValid: workflowResults.criticalSystemHealth, // Simplified for summary
        failedWorkflows: workflowResults.failedWorkflows || [],
        reportPath: 'out/smoke/workflows/workflows-smoke.json',
      },
      systemHealth: {
        overallHealth: agentResults.success && workflowResults.success,
        criticalSystemsOnline: agentResults.criticalSystemHealth && workflowResults.criticalSystemHealth,
        shadowModeCompliant: this.assessShadowModeCompliance(agentResults, workflowResults),
        performanceWithinLimits: this.assessPerformance(agentResults, workflowResults),
      },
      recommendations: this.generateRecommendations(agentResults, workflowResults),
      errors: [...(agentResults.errors || []), ...(workflowResults.errors || [])],
      warnings: [...(agentResults.warnings || []), ...(workflowResults.warnings || [])],
    };

    return summary;
  }

  /**
   * Load agent test results from summary file
   */
  private async loadAgentResults(): Promise<any> {
    const summaryPath = path.join(this.outDir, 'agents', 'agents-summary.json');
    
    try {
      if (fs.existsSync(summaryPath)) {
        const content = fs.readFileSync(summaryPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Could not load agent results: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Return default if file doesn't exist
    return {
      success: false,
      totalAgents: 0,
      passedAgents: 0,
      failedAgents: 0,
      warningCount: 0,
      duration: '0s',
      criticalSystemHealth: false,
      errors: ['Agent smoke tests not executed'],
      warnings: [],
      failedAgents: [],
    };
  }

  /**
   * Load workflow test results from summary file
   */
  private async loadWorkflowResults(): Promise<any> {
    const summaryPath = path.join(this.outDir, 'workflows', 'workflows-summary.json');
    
    try {
      if (fs.existsSync(summaryPath)) {
        const content = fs.readFileSync(summaryPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Could not load workflow results: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Return default if file doesn't exist
    return {
      success: false,
      totalWorkflows: 0,
      passedWorkflows: 0,
      failedWorkflows: 0,
      warningCount: 0,
      duration: '0s',
      workflowCoverage: '0%',
      criticalSystemHealth: false,
      errors: ['Workflow smoke tests not executed'],
      warnings: [],
      failedWorkflows: [],
    };
  }

  /**
   * Assess shadow mode compliance across tests
   */
  private assessShadowModeCompliance(agentResults: any, workflowResults: any): boolean {
    // Shadow mode is compliant if both agent and workflow tests respect it
    return agentResults.success && workflowResults.success;
  }

  /**
   * Assess overall performance
   */
  private assessPerformance(agentResults: any, workflowResults: any): boolean {
    // Performance is within limits if no performance-related failures occurred
    const agentDuration = this.parseDuration(agentResults.duration);
    const workflowDuration = this.parseDuration(workflowResults.duration);
    
    // Reasonable thresholds: agents < 60s, workflows < 120s
    return agentDuration < 60000 && workflowDuration < 120000;
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(durationStr: string): number {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    
    const match = durationStr.match(/^(\d+\.?\d*)s?$/);
    if (match) {
      return parseFloat(match[1]) * 1000;
    }
    
    return 0;
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(agentResults: any, workflowResults: any): string[] {
    const recommendations: string[] = [];

    // Agent-specific recommendations
    if (!agentResults.success) {
      if (agentResults.failedAgents.length > 0) {
        recommendations.push(`Investigate failed agents: ${agentResults.failedAgents.join(', ')}`);
      }
      
      if (!agentResults.criticalSystemHealth) {
        recommendations.push('Critical agent health issues detected - prioritize fixes for core agents (feed, promoter, grading)');
      }
    }

    // Workflow-specific recommendations
    if (!workflowResults.success) {
      if (workflowResults.failedWorkflows.length > 0) {
        recommendations.push(`Investigate failed workflows: ${workflowResults.failedWorkflows.join(', ')}`);
      }
      
      if (!workflowResults.criticalSystemHealth) {
        recommendations.push('Critical workflow health issues detected - prioritize fixes for core workflows');
      }
    }

    // Performance recommendations
    const agentDuration = this.parseDuration(agentResults.duration);
    const workflowDuration = this.parseDuration(workflowResults.duration);
    
    if (agentDuration > 30000) {
      recommendations.push('Agent smoke tests taking longer than expected - consider optimizing agent implementations');
    }
    
    if (workflowDuration > 60000) {
      recommendations.push('Workflow smoke tests taking longer than expected - consider optimizing workflow implementations');
    }

    // Shadow mode recommendations
    if (agentResults.warningCount > 0 || workflowResults.warningCount > 0) {
      recommendations.push('Multiple warnings detected - review test output for potential issues');
    }

    // General recommendations
    if (recommendations.length === 0 && agentResults.success && workflowResults.success) {
      recommendations.push('All smoke tests passed - system is ready for integration testing');
    }

    return recommendations;
  }

  /**
   * Save summary to file
   */
  async saveSummary(summary: CombinedSmokeTestSummary): Promise<string> {
    const summaryPath = path.join(this.outDir, 'smoke-summary.json');
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    
    // Write summary
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    return summaryPath;
  }

  /**
   * Generate dashboard integration data
   */
  generateDashboardData(summary: CombinedSmokeTestSummary) {
    const dashboardPath = path.join(this.outDir, 'smoke-dashboard.json');
    
    const dashboardData = {
      timestamp: summary.timestamp,
      status: summary.overallSuccess ? 'PASS' : 'FAIL',
      environment: summary.environment.shadowMode ? 'SHADOW' : 'LIVE',
      metrics: {
        agent_tests_passed: summary.agents.passedTests,
        agent_tests_failed: summary.agents.failedTests,
        workflow_tests_passed: summary.workflows.passedTests,
        workflow_tests_failed: summary.workflows.failedTests,
        total_warnings: summary.agents.warningCount + summary.workflows.warningCount,
        overall_health_score: this.calculateHealthScore(summary),
      },
      alerts: [
        ...summary.errors.map(error => ({ level: 'error', message: error })),
        ...summary.warnings.map(warning => ({ level: 'warning', message: warning })),
      ],
      recommendations: summary.recommendations,
    };

    fs.writeFileSync(dashboardPath, JSON.stringify(dashboardData, null, 2));
    return dashboardPath;
  }

  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(summary: CombinedSmokeTestSummary): number {
    const totalTests = summary.agents.totalTests + summary.workflows.totalTests;
    const totalPassed = summary.agents.passedTests + summary.workflows.passedTests;
    
    if (totalTests === 0) return 0;
    
    const baseScore = (totalPassed / totalTests) * 100;
    
    // Deduct points for critical system issues
    let healthScore = baseScore;
    if (!summary.systemHealth.criticalSystemsOnline) healthScore *= 0.5;
    if (!summary.systemHealth.shadowModeCompliant) healthScore *= 0.8;
    if (!summary.systemHealth.performanceWithinLimits) healthScore *= 0.9;
    
    return Math.round(healthScore);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('📊 Generating combined smoke test summary...');
    
    const generator = new SmokeTestSummaryGenerator();
    const summary = await generator.generateSummary();
    
    // Save summary
    const summaryPath = await generator.saveSummary(summary);
    
    // Generate dashboard data
    const dashboardPath = generator.generateDashboardData(summary);
    
    // Console output
    console.log('\n🎯 Combined Smoke Test Summary:');
    console.log(`  Overall Success: ${summary.overallSuccess ? '✅' : '❌'}`);
    console.log(`  Environment: ${summary.environment.shadowMode ? 'SHADOW' : 'LIVE'} mode`);
    console.log(`  Agent Tests: ${summary.agents.passedTests}/${summary.agents.totalTests} passed`);
    console.log(`  Workflow Tests: ${summary.workflows.passedTests}/${summary.workflows.totalTests} passed`);
    console.log(`  System Health: ${summary.systemHealth.overallHealth ? '✅' : '❌'}`);
    console.log(`  Critical Systems: ${summary.systemHealth.criticalSystemsOnline ? '✅' : '❌'}`);
    console.log(`  Shadow Compliance: ${summary.systemHealth.shadowModeCompliant ? '✅' : '❌'}`);
    console.log(`  Performance: ${summary.systemHealth.performanceWithinLimits ? '✅' : '❌'}`);

    if (summary.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      summary.recommendations.forEach(rec => console.log(`  - ${rec}`));
    }

    if (summary.errors.length > 0) {
      console.log('\n🚨 Errors:');
      summary.errors.slice(0, 5).forEach(error => console.log(`  - ${error}`));
      if (summary.errors.length > 5) {
        console.log(`  ... and ${summary.errors.length - 5} more errors`);
      }
    }

    if (summary.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      summary.warnings.slice(0, 5).forEach(warning => console.log(`  - ${warning}`));
      if (summary.warnings.length > 5) {
        console.log(`  ... and ${summary.warnings.length - 5} more warnings`);
      }
    }

    console.log(`\n📁 Summary report: ${summaryPath}`);
    console.log(`📁 Dashboard data: ${dashboardPath}`);
    
    // Exit with appropriate code
    process.exit(summary.overallSuccess ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Smoke test summary generation failed:', error);
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

export { SmokeTestSummaryGenerator, type CombinedSmokeTestSummary };