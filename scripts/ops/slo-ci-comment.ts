#!/usr/bin/env node

/**
 * SLO CI Comment Generator
 * 
 * Generates markdown comments for CI/CD integration with SLO monitoring results.
 * Designed for GitHub Actions, GitLab CI, and other CI platforms.
 * 
 * Usage:
 *   npm run ops:slo-comment                    # Generate comment from latest SLO data
 *   npm run ops:slo-comment -- --pr 123       # For specific PR number
 *   npm run ops:slo-comment -- --format json  # Output as JSON for API posting
 */

import { logger, createLogger } from '@unit-talk/observability';
import { sloReporter, SLOReport, DashboardSLOData } from '@unit-talk/observability/slo-reporter';
import * as fs from 'fs/promises';
import * as path from 'path';

// Create CI-specific logger
const ciLogger = createLogger('slo-ci-comment', process.env.LOG_LEVEL as any);

interface CICommentOptions {
  format: 'markdown' | 'json' | 'text';
  pr?: number;
  output?: string;
  includeDetails: boolean;
  includeRecommendations: boolean;
  help: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CICommentOptions {
  const args = process.argv.slice(2);
  const options: CICommentOptions = {
    format: 'markdown',
    includeDetails: true,
    includeRecommendations: true,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--format':
        const format = args[++i];
        if (['markdown', 'json', 'text'].includes(format)) {
          options.format = format as 'markdown' | 'json' | 'text';
        }
        break;
      case '--pr':
        options.pr = parseInt(args[++i]);
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--no-details':
        options.includeDetails = false;
        break;
      case '--no-recommendations':
        options.includeRecommendations = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Display help information
 */
function displayHelp(): void {
  console.log(`
Unit Talk SLO CI Comment Generator

USAGE:
  npm run ops:slo-comment [OPTIONS]

OPTIONS:
  --format FORMAT      Output format: markdown, json, text (default: markdown)
  --pr NUMBER          PR/MR number for comment context
  --output PATH        Output file path (default: stdout)
  --no-details         Exclude detailed metrics
  --no-recommendations Exclude recommendations
  --help, -h           Show this help message

EXAMPLES:
  npm run ops:slo-comment                           # Markdown comment to stdout
  npm run ops:slo-comment -- --format json         # JSON for API posting
  npm run ops:slo-comment -- --pr 123              # Include PR context
  npm run ops:slo-comment -- --output comment.md   # Save to file

INTEGRATION:
  GitHub Actions: Use with actions/github-script or gh CLI
  GitLab CI: Use with GitLab API calls
  Generic CI: Save to artifact or post via webhook
`);
}

/**
 * Load latest SLO data from file system
 */
async function loadLatestSLOData(): Promise<{
  report?: SLOReport;
  dashboard?: DashboardSLOData;
}> {
  const opsDir = path.join(process.cwd(), 'out', 'ops');

  try {
    // Load dashboard data
    let dashboard: DashboardSLOData | undefined;
    const dashboardPath = path.join(opsDir, 'slo.json');
    try {
      const dashboardContent = await fs.readFile(dashboardPath, 'utf-8');
      dashboard = JSON.parse(dashboardContent);
      ciLogger.debug('Loaded dashboard SLO data', { path: dashboardPath });
    } catch (error) {
      ciLogger.warn('Could not load dashboard SLO data', { path: dashboardPath });
    }

    // Load latest report
    let report: SLOReport | undefined;
    try {
      const files = await fs.readdir(opsDir);
      const reportFiles = files
        .filter(f => f.startsWith('slo-report-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (reportFiles.length > 0) {
        const reportPath = path.join(opsDir, reportFiles[0]);
        const reportContent = await fs.readFile(reportPath, 'utf-8');
        report = JSON.parse(reportContent);
        ciLogger.debug('Loaded SLO report', { path: reportPath });
      }
    } catch (error) {
      ciLogger.warn('Could not load SLO report', { error: error instanceof Error ? error.message : 'Unknown' });
    }

    return { report, dashboard };

  } catch (error) {
    ciLogger.error('Failed to load SLO data', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ops_dir: opsDir
    });
    throw error;
  }
}

/**
 * Generate status emoji for SLO status
 */
function getStatusEmoji(status: 'green' | 'yellow' | 'red' | 'healthy' | 'warning' | 'critical'): string {
  switch (status) {
    case 'green':
    case 'healthy':
      return '✅';
    case 'yellow':
    case 'warning':
      return '⚠️';
    case 'red':
    case 'critical':
      return '🔴';
    default:
      return '⚪';
  }
}

/**
 * Format latency for display
 */
function formatLatency(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  } else if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining.toFixed(0)}s`;
  }
}

/**
 * Generate markdown comment
 */
function generateMarkdownComment(
  data: { report?: SLOReport; dashboard?: DashboardSLOData },
  options: CICommentOptions
): string {
  const { report, dashboard } = data;
  const timestamp = new Date().toISOString();

  let comment = `## 📊 SLO Monitoring Report\n\n`;
  
  if (options.pr) {
    comment += `**Pull Request:** #${options.pr}\n`;
  }
  
  comment += `**Generated:** ${timestamp}\n\n`;

  // Overall status
  if (report) {
    const statusEmoji = getStatusEmoji(report.overall_health.status);
    comment += `### ${statusEmoji} Overall Health: **${report.overall_health.status.toUpperCase()}**\n\n`;
    comment += `- **Availability:** ${report.overall_health.availability_score.toFixed(1)}%\n`;
    comment += `- **Error Budget Remaining:** ${report.overall_health.error_budget_remaining.toFixed(1)}%\n`;
    comment += `- **Active Alerts:** ${report.alerts.active_alerts}\n\n`;
  } else if (dashboard) {
    comment += `### 📈 Current SLO Status\n\n`;
  }

  // Individual SLO metrics
  if (dashboard && options.includeDetails) {
    comment += `### 🎯 Latency Metrics\n\n`;
    comment += `| Metric | Status | P95 Current | P95 Target | Compliance |\n`;
    comment += `|--------|--------|-------------|------------|-----------|\n`;

    const metrics = [
      {
        name: 'Ingest → Processed',
        data: dashboard.slo_status.ingest_to_processed
      },
      {
        name: 'Processed → Promoted', 
        data: dashboard.slo_status.processed_to_promoted
      },
      {
        name: 'End-to-End Pipeline',
        data: dashboard.slo_status.end_to_end
      }
    ];

    metrics.forEach(metric => {
      const statusEmoji = getStatusEmoji(metric.data.status);
      const current = formatLatency(metric.data.current_p95);
      const target = formatLatency(metric.data.target_p95);
      const compliance = `${metric.data.compliance_percentage.toFixed(1)}%`;
      
      comment += `| ${metric.name} | ${statusEmoji} ${metric.data.status} | ${current} | ${target} | ${compliance} |\n`;
    });

    comment += `\n`;
  }

  // Error budget
  if (dashboard) {
    comment += `### 🛡️ Error Budget Status\n\n`;
    const budgetEmoji = dashboard.error_budget.consumed_percentage > 80 ? '🔴' :
                       dashboard.error_budget.consumed_percentage > 50 ? '⚠️' : '✅';
    comment += `${budgetEmoji} **${dashboard.error_budget.consumed_percentage.toFixed(1)}%** consumed `;
    comment += `(${dashboard.error_budget.remaining_days} days remaining)\n\n`;

    // Progress bar visualization
    const totalBars = 20;
    const filledBars = Math.round((dashboard.error_budget.consumed_percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    comment += `\`${progressBar}\` ${dashboard.error_budget.consumed_percentage.toFixed(1)}%\n\n`;
  }

  // Recent breaches
  if (report && report.alerts.recent_breaches.length > 0) {
    comment += `### 🚨 Recent SLO Breaches\n\n`;
    comment += `| Time | Metric | Severity | Duration |\n`;
    comment += `|------|--------|----------|----------|\n`;

    report.alerts.recent_breaches.slice(0, 5).forEach(breach => {
      const time = new Date(breach.timestamp).toLocaleString();
      const severity = breach.severity === 'critical' ? '🔴 Critical' : '⚠️ Warning';
      comment += `| ${time} | ${breach.metric} | ${severity} | ${breach.duration_minutes}min |\n`;
    });

    comment += `\n`;
  }

  // Recommendations
  if (report && options.includeRecommendations && report.recommendations.length > 0) {
    comment += `### 💡 Recommendations\n\n`;
    report.recommendations.forEach((rec, index) => {
      comment += `${index + 1}. ${rec}\n`;
    });
    comment += `\n`;
  }

  // Trends summary
  if (dashboard && Object.keys(dashboard.trends).length > 0) {
    comment += `### 📈 Trend Summary\n\n`;
    Object.entries(dashboard.trends).forEach(([metricName, trendData]) => {
      if (trendData.length >= 2) {
        const latest = trendData[trendData.length - 1];
        const previous = trendData[Math.max(0, trendData.length - 6)]; // 6 measurements ago
        const trendDirection = latest.p95_latency > previous.p95_latency ? '📈' : '📉';
        const trendPercentage = ((latest.p95_latency - previous.p95_latency) / previous.p95_latency * 100).toFixed(1);
        
        comment += `- **${metricName}**: ${trendDirection} ${trendPercentage}% over last period\n`;
      }
    });
    comment += `\n`;
  }

  comment += `---\n`;
  comment += `*Generated by Unit Talk SLO Monitor* | `;
  comment += `[Documentation](https://github.com/unit-talk/unit-talk-core/docs/slo-monitoring) | `;
  comment += `[Dashboard](./out/ops/slo.json)`;

  return comment;
}

/**
 * Generate JSON comment for API posting
 */
function generateJSONComment(
  data: { report?: SLOReport; dashboard?: DashboardSLOData },
  options: CICommentOptions
): string {
  const { report, dashboard } = data;
  
  const commentData = {
    timestamp: new Date().toISOString(),
    pr_number: options.pr,
    slo_status: {
      overall_health: report ? {
        status: report.overall_health.status,
        availability_score: report.overall_health.availability_score,
        error_budget_remaining: report.overall_health.error_budget_remaining
      } : undefined,
      metrics: dashboard ? {
        ingest_to_processed: dashboard.slo_status.ingest_to_processed,
        processed_to_promoted: dashboard.slo_status.processed_to_promoted,
        end_to_end: dashboard.slo_status.end_to_end
      } : undefined,
      error_budget: dashboard ? dashboard.error_budget : undefined
    },
    alerts: report ? {
      active_alerts: report.alerts.active_alerts,
      recent_breaches: report.alerts.recent_breaches.slice(0, 5)
    } : undefined,
    recommendations: report && options.includeRecommendations ? report.recommendations : undefined,
    markdown_comment: generateMarkdownComment(data, options)
  };

  return JSON.stringify(commentData, null, 2);
}

/**
 * Generate plain text comment
 */
function generateTextComment(
  data: { report?: SLOReport; dashboard?: DashboardSLOData },
  options: CICommentOptions
): string {
  const { report, dashboard } = data;
  
  let comment = `SLO MONITORING REPORT\n`;
  comment += `===================\n\n`;
  comment += `Generated: ${new Date().toISOString()}\n`;
  
  if (options.pr) {
    comment += `Pull Request: #${options.pr}\n`;
  }
  comment += `\n`;

  if (report) {
    comment += `OVERALL HEALTH: ${report.overall_health.status.toUpperCase()}\n`;
    comment += `- Availability: ${report.overall_health.availability_score.toFixed(1)}%\n`;
    comment += `- Error Budget Remaining: ${report.overall_health.error_budget_remaining.toFixed(1)}%\n`;
    comment += `- Active Alerts: ${report.alerts.active_alerts}\n\n`;
  }

  if (dashboard && options.includeDetails) {
    comment += `LATENCY METRICS:\n`;
    comment += `- Ingest -> Processed: ${formatLatency(dashboard.slo_status.ingest_to_processed.current_p95)} (target: ${formatLatency(dashboard.slo_status.ingest_to_processed.target_p95)})\n`;
    comment += `- Processed -> Promoted: ${formatLatency(dashboard.slo_status.processed_to_promoted.current_p95)} (target: ${formatLatency(dashboard.slo_status.processed_to_promoted.target_p95)})\n`;
    comment += `- End-to-End Pipeline: ${formatLatency(dashboard.slo_status.end_to_end.current_p95)} (target: ${formatLatency(dashboard.slo_status.end_to_end.target_p95)})\n\n`;
  }

  if (report && options.includeRecommendations && report.recommendations.length > 0) {
    comment += `RECOMMENDATIONS:\n`;
    report.recommendations.forEach((rec, index) => {
      comment += `${index + 1}. ${rec}\n`;
    });
  }

  return comment;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    displayHelp();
    return;
  }

  try {
    ciLogger.info('Generating SLO CI comment', {
      format: options.format,
      pr: options.pr,
      include_details: options.includeDetails
    });

    // Load SLO data
    const data = await loadLatestSLOData();

    if (!data.report && !data.dashboard) {
      throw new Error('No SLO data available. Run "npm run ops:slo" first to generate data.');
    }

    // Generate comment
    let comment: string;
    switch (options.format) {
      case 'markdown':
        comment = generateMarkdownComment(data, options);
        break;
      case 'json':
        comment = generateJSONComment(data, options);
        break;
      case 'text':
        comment = generateTextComment(data, options);
        break;
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }

    // Output comment
    if (options.output) {
      await fs.writeFile(options.output, comment);
      ciLogger.info('SLO comment saved to file', { path: options.output });
      console.log(`✅ SLO comment saved to: ${options.output}`);
    } else {
      console.log(comment);
    }

  } catch (error) {
    ciLogger.error('Failed to generate SLO CI comment', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`❌ Failed to generate SLO comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

// Run CLI if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}