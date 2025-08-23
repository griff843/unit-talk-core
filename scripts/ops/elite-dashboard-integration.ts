#!/usr/bin/env node

/**
 * Elite Dashboard Integration Module
 * 
 * Integration utilities for embedding the elite dashboard into existing
 * monitoring workflows and CI/CD pipelines. Provides seamless integration
 * with the existing Unit Talk infrastructure.
 * 
 * Features:
 * - Integration with existing ops-all.ts workflow
 * - CI/CD pipeline integration hooks
 * - Backwards compatibility with legacy dashboard
 * - Environment-specific configuration
 * - Automated deployment phase detection
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EliteDashboardAggregator, type EliteDashboardData } from './elite-dashboard-aggregator.js';
import { generateEliteDashboardHTML } from './elite-dashboard-components.js';

interface IntegrationConfig {
  outputDir: string;
  generateLegacyFormat: boolean;
  generateHTMLFile: boolean;
  enableCIPipeline: boolean;
  enableSlackNotifications: boolean;
  enableLinearIntegration: boolean;
  environmentOverrides: Record<string, any>;
}

class EliteDashboardIntegration {
  private config: IntegrationConfig;
  private aggregator: EliteDashboardAggregator;

  constructor(config: Partial<IntegrationConfig> = {}) {
    this.config = {
      outputDir: config.outputDir || join(process.cwd(), 'out', 'ops'),
      generateLegacyFormat: config.generateLegacyFormat !== false,
      generateHTMLFile: config.generateHTMLFile !== false,
      enableCIPipeline: config.enableCIPipeline !== false,
      enableSlackNotifications: config.enableSlackNotifications || false,
      enableLinearIntegration: config.enableLinearIntegration || false,
      environmentOverrides: config.environmentOverrides || {}
    };

    this.aggregator = new EliteDashboardAggregator(this.config.outputDir);

    // Ensure output directory exists
    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Integration with existing ops-all.ts workflow
   */
  async integrateWithOpsAll(): Promise<{
    success: boolean;
    dashboard_data: EliteDashboardData;
    legacy_compatible: boolean;
    files_generated: string[];
  }> {
    console.log('🔗 Integrating elite dashboard with ops-all workflow...');

    try {
      // Generate elite dashboard data
      const dashboardData = await this.aggregator.aggregate();
      const files: string[] = [];

      // Save elite dashboard format
      const elitePath = await this.aggregator.save(dashboardData);
      files.push(elitePath);

      // Generate legacy format for backwards compatibility
      if (this.config.generateLegacyFormat) {
        const legacyPath = join(this.config.outputDir, 'dashboard.json');
        const legacyData = this.convertToLegacyFormat(dashboardData);
        writeFileSync(legacyPath, JSON.stringify(legacyData, null, 2));
        files.push(legacyPath);
        console.log('📄 Legacy dashboard.json format generated for backwards compatibility');
      }

      // Generate HTML file for direct viewing
      if (this.config.generateHTMLFile) {
        const htmlPath = join(this.config.outputDir, 'elite-dashboard.html');
        const html = generateEliteDashboardHTML(dashboardData);
        writeFileSync(htmlPath, html);
        files.push(htmlPath);
        console.log('🌐 Elite dashboard HTML file generated');
      }

      console.log(`✅ Elite dashboard integration completed - Health Score: ${dashboardData.overall_status.health_score}/100`);

      return {
        success: true,
        dashboard_data: dashboardData,
        legacy_compatible: this.config.generateLegacyFormat,
        files_generated: files
      };

    } catch (error) {
      console.error('❌ Elite dashboard integration failed:', error);
      return {
        success: false,
        dashboard_data: {} as EliteDashboardData,
        legacy_compatible: false,
        files_generated: []
      };
    }
  }

  /**
   * Generate CI/CD pipeline integration artifacts
   */
  async generateCIArtifacts(dashboardData: EliteDashboardData): Promise<{
    artifacts_generated: string[];
    should_block_deployment: boolean;
    health_summary: any;
  }> {
    if (!this.config.enableCIPipeline) {
      return {
        artifacts_generated: [],
        should_block_deployment: false,
        health_summary: {}
      };
    }

    console.log('🔄 Generating CI/CD pipeline artifacts...');

    const artifacts: string[] = [];
    const criticalIssues = dashboardData.alerts.filter(a => a.level === 'CRITICAL').length;
    const shouldBlockDeployment = criticalIssues > 0 || dashboardData.overall_status.health_score < 70;

    // Health summary for CI
    const healthSummary = {
      health_score: dashboardData.overall_status.health_score,
      status: dashboardData.overall_status.status,
      critical_issues: criticalIssues,
      warning_issues: dashboardData.alerts.filter(a => a.level === 'WARNING').length,
      deployment_safe: !shouldBlockDeployment,
      timestamp: dashboardData.timestamp,
      deployment_phase: dashboardData.overall_status.deployment_phase,
      systems_healthy: dashboardData.overall_status.systems_healthy,
      systems_total: dashboardData.overall_status.systems_total
    };

    // CI summary file
    const ciSummaryPath = join(this.config.outputDir, 'ci-health-summary.json');
    writeFileSync(ciSummaryPath, JSON.stringify(healthSummary, null, 2));
    artifacts.push(ciSummaryPath);

    // GitHub Actions summary
    const githubSummaryPath = join(this.config.outputDir, 'github-actions-summary.md');
    const githubSummary = this.generateGitHubActionsSummary(dashboardData);
    writeFileSync(githubSummaryPath, githubSummary);
    artifacts.push(githubSummaryPath);

    // Deployment gate file
    const deploymentGatePath = join(this.config.outputDir, 'deployment-gate.json');
    const deploymentGate = {
      gate_status: shouldBlockDeployment ? 'BLOCKED' : 'PASSED',
      blocking_reasons: shouldBlockDeployment ? [
        ...(criticalIssues > 0 ? [`${criticalIssues} critical alerts detected`] : []),
        ...(dashboardData.overall_status.health_score < 70 ? [`Health score below threshold: ${dashboardData.overall_status.health_score}/100`] : [])
      ] : [],
      health_score: dashboardData.overall_status.health_score,
      critical_alerts: criticalIssues,
      timestamp: dashboardData.timestamp,
      next_steps: shouldBlockDeployment ? [
        'Review critical alerts in dashboard',
        'Run diagnostic commands',
        'Contact operations team if needed'
      ] : [
        'Deployment is safe to proceed',
        'Monitor dashboard after deployment'
      ]
    };
    writeFileSync(deploymentGatePath, JSON.stringify(deploymentGate, null, 2));
    artifacts.push(deploymentGatePath);

    console.log(`📊 CI/CD artifacts generated (deployment ${shouldBlockDeployment ? 'BLOCKED' : 'ALLOWED'})`);

    return {
      artifacts_generated: artifacts,
      should_block_deployment: shouldBlockDeployment,
      health_summary: healthSummary
    };
  }

  /**
   * Generate GitHub Actions summary markdown
   */
  private generateGitHubActionsSummary(data: EliteDashboardData): string {
    const statusEmoji = data.overall_status.status === 'healthy' ? '✅' : 
                        data.overall_status.status === 'warning' ? '⚠️' : '🚨';
    
    const criticalAlerts = data.alerts.filter(a => a.level === 'CRITICAL');
    const warningAlerts = data.alerts.filter(a => a.level === 'WARNING');

    return `# Unit Talk Elite Dashboard Summary ${statusEmoji}

## System Health Overview
- **Health Score**: ${data.overall_status.health_score}/100
- **Status**: ${data.overall_status.status.toUpperCase()}
- **Systems Healthy**: ${data.overall_status.systems_healthy}/${data.overall_status.systems_total}
- **Deployment Phase**: ${data.overall_status.deployment_phase}

## Alert Summary
- 🚨 **Critical**: ${criticalAlerts.length}
- ⚠️ **Warning**: ${warningAlerts.length}
- ℹ️ **Info**: ${data.alerts.filter(a => a.level === 'INFO').length}

${criticalAlerts.length > 0 ? `
## Critical Alerts 🚨
${criticalAlerts.slice(0, 5).map(alert => `
- **${alert.system}**: ${alert.message}
  - *${new Date(alert.timestamp).toLocaleString()}*
`).join('')}
` : ''}

## Core Services Status
${Object.entries(data.services).map(([name, status]) => {
  const emoji = status.status === 'healthy' ? '✅' : 
                status.status === 'warning' ? '⚠️' : '🚨';
  return `- ${emoji} **${name.toUpperCase()}**: ${status.message}`;
}).join('\n')}

## Monitoring Systems Status  
${Object.entries(data.monitoring_systems).map(([name, status]) => {
  const emoji = status.status === 'healthy' ? '✅' : 
                status.status === 'warning' ? '⚠️' : '🚨';
  return `- ${emoji} **${name.toUpperCase()}**: ${status.message}`;
}).join('\n')}

## System Metrics
- **Raw Ingested (5min)**: ${data.metrics.ingestion.raw_new_5min}
- **Processed (5min)**: ${data.metrics.ingestion.processed_5min}
- **Promoted (5min)**: ${data.metrics.ingestion.promoted_5min}
- **Backlog Size**: ${data.metrics.performance.backlog_size}
- **Memory Usage**: ${data.metrics.performance.total_memory_mb}MB

---
*Generated at ${new Date(data.timestamp).toLocaleString()} by Elite Dashboard v1.0.0*
`;
  }

  /**
   * Convert elite dashboard data to legacy format
   */
  private convertToLegacyFormat(data: EliteDashboardData): any {
    return {
      timestamp: data.timestamp,
      environment: data.environment,
      services: Object.fromEntries(
        Object.entries(data.services).map(([name, status]) => [
          name,
          {
            status: status.status === 'healthy' ? 'healthy' : 'unhealthy',
            health: {
              message: status.message,
              response_time_ms: status.response_time_ms,
              last_check: status.timestamp
            }
          }
        ])
      ),
      metrics: data.metrics,
      alerts: data.alerts.map(alert => ({
        level: alert.level,
        message: alert.message,
        timestamp: alert.timestamp,
        system: alert.system
      })),
      phase: data.overall_status.deployment_phase,
      elite_dashboard: {
        enabled: true,
        health_score: data.overall_status.health_score,
        monitoring_systems_count: Object.keys(data.monitoring_systems).length,
        version: '1.0.0'
      }
    };
  }

  /**
   * Generate Slack notification payload (if enabled)
   */
  async generateSlackNotification(data: EliteDashboardData): Promise<any | null> {
    if (!this.config.enableSlackNotifications) return null;

    const criticalAlerts = data.alerts.filter(a => a.level === 'CRITICAL');
    const warningAlerts = data.alerts.filter(a => a.level === 'WARNING');

    if (criticalAlerts.length === 0 && warningAlerts.length === 0) {
      return null; // No notifications for healthy state
    }

    const statusEmoji = data.overall_status.status === 'healthy' ? ':white_check_mark:' : 
                        data.overall_status.status === 'warning' ? ':warning:' : ':rotating_light:';

    const color = data.overall_status.status === 'healthy' ? 'good' : 
                  data.overall_status.status === 'warning' ? 'warning' : 'danger';

    return {
      text: `Unit Talk Dashboard Alert ${statusEmoji}`,
      attachments: [
        {
          color: color,
          fields: [
            {
              title: 'Health Score',
              value: `${data.overall_status.health_score}/100`,
              short: true
            },
            {
              title: 'Status',
              value: data.overall_status.status.toUpperCase(),
              short: true
            },
            {
              title: 'Critical Alerts',
              value: criticalAlerts.length.toString(),
              short: true
            },
            {
              title: 'Warning Alerts',
              value: warningAlerts.length.toString(),
              short: true
            }
          ],
          ts: Math.floor(new Date(data.timestamp).getTime() / 1000)
        }
      ]
    };
  }

  /**
   * Generate Linear integration data (if enabled)
   */
  async generateLinearIntegration(data: EliteDashboardData): Promise<any | null> {
    if (!this.config.enableLinearIntegration) return null;

    const criticalAlerts = data.alerts.filter(a => a.level === 'CRITICAL');
    
    if (criticalAlerts.length === 0) return null;

    // Generate Linear issues for critical alerts
    const issues = criticalAlerts.map(alert => ({
      title: `[Dashboard Alert] ${alert.system}: ${alert.message}`,
      description: `Critical alert detected by Elite Dashboard monitoring system.

**System**: ${alert.system}
**Message**: ${alert.message}
**Timestamp**: ${new Date(alert.timestamp).toLocaleString()}
**Health Score**: ${data.overall_status.health_score}/100
**Deployment Phase**: ${data.overall_status.deployment_phase}

${alert.escalation_contact ? `**Contact**: ${alert.escalation_contact}` : ''}

**Dashboard Link**: http://localhost:3001/dashboard
**Action Required**: ${alert.action_required ? 'Yes' : 'No'}
`,
      priority: 1, // High priority for critical alerts
      labels: ['dashboard-alert', 'operations', 'critical'],
      team: 'operations',
      assignee: alert.escalation_contact || 'ops@unit-talk.com'
    }));

    return {
      issues_to_create: issues,
      dashboard_health: {
        score: data.overall_status.health_score,
        status: data.overall_status.status,
        timestamp: data.timestamp
      }
    };
  }

  /**
   * Full integration workflow
   */
  async runFullIntegration(): Promise<{
    success: boolean;
    dashboard_integration: any;
    ci_artifacts: any;
    slack_payload: any;
    linear_integration: any;
    summary: {
      health_score: number;
      deployment_safe: boolean;
      files_generated: string[];
      integrations_enabled: string[];
    };
  }> {
    console.log('🚀 Running full elite dashboard integration...');

    // Core dashboard integration
    const dashboardIntegration = await this.integrateWithOpsAll();
    
    if (!dashboardIntegration.success) {
      return {
        success: false,
        dashboard_integration: dashboardIntegration,
        ci_artifacts: null,
        slack_payload: null,
        linear_integration: null,
        summary: {
          health_score: 0,
          deployment_safe: false,
          files_generated: [],
          integrations_enabled: []
        }
      };
    }

    const data = dashboardIntegration.dashboard_data;

    // Generate CI/CD artifacts
    const ciArtifacts = await this.generateCIArtifacts(data);

    // Generate integration payloads
    const slackPayload = await this.generateSlackNotification(data);
    const linearIntegration = await this.generateLinearIntegration(data);

    // Determine enabled integrations
    const integrationsEnabled = [
      'dashboard',
      ...(this.config.generateLegacyFormat ? ['legacy-format'] : []),
      ...(this.config.generateHTMLFile ? ['html-file'] : []),
      ...(this.config.enableCIPipeline ? ['ci-cd'] : []),
      ...(slackPayload ? ['slack'] : []),
      ...(linearIntegration ? ['linear'] : [])
    ];

    const allFiles = [
      ...dashboardIntegration.files_generated,
      ...ciArtifacts.artifacts_generated
    ];

    console.log(`✅ Full integration completed - ${integrationsEnabled.length} integrations enabled`);

    return {
      success: true,
      dashboard_integration: dashboardIntegration,
      ci_artifacts: ciArtifacts,
      slack_payload: slackPayload,
      linear_integration: linearIntegration,
      summary: {
        health_score: data.overall_status.health_score,
        deployment_safe: !ciArtifacts.should_block_deployment,
        files_generated: allFiles,
        integrations_enabled: integrationsEnabled
      }
    };
  }
}

/**
 * Integration function for use in ops-all.ts
 */
export async function integrateEliteDashboard(config: Partial<IntegrationConfig> = {}): Promise<any> {
  const integration = new EliteDashboardIntegration(config);
  return await integration.runFullIntegration();
}

/**
 * CLI interface for integration
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';

  try {
    const integration = new EliteDashboardIntegration({
      enableCIPipeline: !args.includes('--no-ci'),
      enableSlackNotifications: args.includes('--slack'),
      enableLinearIntegration: args.includes('--linear'),
      generateLegacyFormat: !args.includes('--no-legacy'),
      generateHTMLFile: !args.includes('--no-html')
    });

    switch (command) {
      case 'full':
        const result = await integration.runFullIntegration();
        console.log('\n📋 Integration Summary:');
        console.log(`   Success: ${result.success ? '✅' : '❌'}`);
        console.log(`   Health Score: ${result.summary.health_score}/100`);
        console.log(`   Deployment Safe: ${result.summary.deployment_safe ? '✅' : '❌'}`);
        console.log(`   Files Generated: ${result.summary.files_generated.length}`);
        console.log(`   Integrations: ${result.summary.integrations_enabled.join(', ')}`);
        
        if (!result.summary.deployment_safe) {
          console.log('\n🚨 DEPLOYMENT BLOCKED - Check critical alerts in dashboard');
          process.exit(1);
        }
        break;

      case 'ops-all':
        const opsResult = await integration.integrateWithOpsAll();
        console.log(`Integration with ops-all: ${opsResult.success ? 'SUCCESS' : 'FAILED'}`);
        if (!opsResult.success) process.exit(1);
        break;

      case 'help':
        console.log(`
Elite Dashboard Integration CLI

USAGE:
  elite-dashboard-integration.ts [COMMAND] [OPTIONS]

COMMANDS:
  full        Run full integration workflow (default)
  ops-all     Integration with ops-all workflow only

OPTIONS:
  --no-ci     Disable CI/CD pipeline integration  
  --no-legacy Disable legacy dashboard.json format
  --no-html   Disable HTML file generation
  --slack     Enable Slack notifications
  --linear    Enable Linear issue creation

EXAMPLES:
  npm run ops:dashboard-integration
  npm run ops:dashboard-integration -- full --slack --linear
  npm run ops:dashboard-integration -- ops-all --no-ci
        `);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Integration failed:', error);
    process.exit(1);
  }
}

// Export for programmatic usage
export { EliteDashboardIntegration, type IntegrationConfig };

// Run CLI if called directly
if (require.main === module) {
  main();
}