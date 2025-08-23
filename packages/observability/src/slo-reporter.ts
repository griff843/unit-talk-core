import { logger } from './index.js';
import { sloMonitor, SLOMeasurement } from './slo-monitor.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * SLO Reporter Service
 * 
 * Generates comprehensive SLO reports with historical trends and
 * exports data in formats suitable for dashboards and CI/CD integration.
 */

export interface SLOTrend {
  metric_name: string;
  time_window: string;
  trend_direction: 'improving' | 'degrading' | 'stable';
  trend_rate: number; // percentage change
  confidence: number; // 0-1 confidence in trend analysis
}

export interface SLOSummary {
  metric_name: string;
  current_status: 'green' | 'yellow' | 'red';
  availability: number; // percentage (0-100)
  error_budget_consumed: number; // percentage (0-100)
  recent_breaches: number;
  trend: SLOTrend;
}

export interface SLOReport {
  timestamp: string;
  version: string;
  report_period: {
    start: string;
    end: string;
    duration_hours: number;
  };
  overall_health: {
    status: 'healthy' | 'warning' | 'critical';
    availability_score: number;
    error_budget_remaining: number;
  };
  slo_summaries: SLOSummary[];
  detailed_measurements: {
    [metric_name: string]: SLOMeasurement[];
  };
  alerts: {
    active_alerts: number;
    recent_breaches: Array<{
      metric: string;
      timestamp: string;
      severity: 'warning' | 'critical';
      duration_minutes: number;
    }>;
  };
  recommendations: string[];
}

export interface DashboardSLOData {
  timestamp: string;
  slo_status: {
    ingest_to_processed: {
      status: 'green' | 'yellow' | 'red';
      current_p95: number;
      target_p95: number;
      compliance_percentage: number;
    };
    processed_to_promoted: {
      status: 'green' | 'yellow' | 'red';
      current_p95: number;
      target_p95: number;
      compliance_percentage: number;
    };
    end_to_end: {
      status: 'green' | 'yellow' | 'red';
      current_p95: number;
      target_p95: number;
      compliance_percentage: number;
    };
  };
  trends: {
    [metric_name: string]: Array<{
      timestamp: string;
      p95_latency: number;
      compliance_score: number;
    }>;
  };
  error_budget: {
    consumed_percentage: number;
    remaining_days: number;
    burn_rate: number;
  };
}

export class SLOReporter {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'out', 'ops');
  }

  /**
   * Analyze trend for a specific metric
   */
  private analyzeTrend(measurements: SLOMeasurement[], windowHours: number = 24): SLOTrend {
    const windowMs = windowHours * 60 * 60 * 1000;
    const cutoffTime = Date.now() - windowMs;
    
    const recentMeasurements = measurements
      .filter(m => new Date(m.timestamp).getTime() >= cutoffTime)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (recentMeasurements.length < 2) {
      return {
        metric_name: measurements[0]?.metric_name || 'unknown',
        time_window: `${windowHours}h`,
        trend_direction: 'stable',
        trend_rate: 0,
        confidence: 0
      };
    }

    // Calculate trend using linear regression of compliance scores
    const dataPoints = recentMeasurements.map((m, index) => ({
      x: index,
      y: m.slo_compliance.overall_score
    }));

    const n = dataPoints.length;
    const sumX = dataPoints.reduce((sum, p) => sum + p.x, 0);
    const sumY = dataPoints.reduce((sum, p) => sum + p.y, 0);
    const sumXY = dataPoints.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = dataPoints.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const trendRate = slope * 100; // Convert to percentage

    // Calculate confidence based on R-squared
    const meanY = sumY / n;
    const ssRes = dataPoints.reduce((sum, p) => {
      const predicted = slope * p.x + (sumY - slope * sumX) / n;
      return sum + Math.pow(p.y - predicted, 2);
    }, 0);
    const ssTot = dataPoints.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
    const confidence = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    let trendDirection: 'improving' | 'degrading' | 'stable' = 'stable';
    if (Math.abs(trendRate) > 5) { // 5% threshold for trend detection
      trendDirection = trendRate > 0 ? 'improving' : 'degrading';
    }

    return {
      metric_name: measurements[0]?.metric_name || 'unknown',
      time_window: `${windowHours}h`,
      trend_direction: trendDirection,
      trend_rate: trendRate,
      confidence
    };
  }

  /**
   * Generate SLO summary for a specific metric
   */
  private generateSLOSummary(metricName: string, measurements: SLOMeasurement[]): SLOSummary {
    const recentMeasurements = measurements.slice(-20); // Last 20 measurements
    const latestMeasurement = measurements[measurements.length - 1];

    if (!latestMeasurement) {
      throw new Error(`No measurements found for metric: ${metricName}`);
    }

    // Calculate availability (percentage of compliant measurements)
    const compliantCount = recentMeasurements.filter(
      m => m.slo_compliance.overall_score >= 0.8
    ).length;
    const availability = (compliantCount / recentMeasurements.length) * 100;

    // Count recent breaches
    const recentBreaches = recentMeasurements.filter(
      m => m.alert_status === 'red'
    ).length;

    // Get trend analysis
    const trend = this.analyzeTrend(measurements);

    return {
      metric_name: metricName,
      current_status: latestMeasurement.alert_status,
      availability,
      error_budget_consumed: latestMeasurement.burn_rate.budget_consumed * 100,
      recent_breaches: recentBreaches,
      trend
    };
  }

  /**
   * Generate comprehensive SLO report
   */
  public async generateReport(periodHours: number = 24): Promise<SLOReport> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - periodHours * 60 * 60 * 1000);

    // Get all measurements from SLO monitor
    const allMeasurements = sloMonitor.exportMeasurements();
    
    // Filter measurements to report period
    const filteredMeasurements: { [key: string]: SLOMeasurement[] } = {};
    for (const [metricName, measurements] of Object.entries(allMeasurements)) {
      filteredMeasurements[metricName] = measurements.filter(
        m => new Date(m.timestamp).getTime() >= startTime.getTime()
      );
    }

    // Generate SLO summaries
    const sloSummaries: SLOSummary[] = [];
    for (const [metricName, measurements] of Object.entries(filteredMeasurements)) {
      if (measurements.length > 0) {
        sloSummaries.push(this.generateSLOSummary(metricName, measurements));
      }
    }

    // Calculate overall health
    const allStatuses = sloSummaries.map(s => s.current_status);
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (allStatuses.includes('red')) {
      overallStatus = 'critical';
    } else if (allStatuses.includes('yellow')) {
      overallStatus = 'warning';
    }

    const availabilityScore = sloSummaries.length > 0 
      ? sloSummaries.reduce((sum, s) => sum + s.availability, 0) / sloSummaries.length
      : 100;

    const errorBudgetRemaining = sloSummaries.length > 0
      ? 100 - sloSummaries.reduce((sum, s) => sum + s.error_budget_consumed, 0) / sloSummaries.length
      : 100;

    // Identify recent breaches for alerts
    const recentBreaches: Array<{
      metric: string;
      timestamp: string;
      severity: 'warning' | 'critical';
      duration_minutes: number;
    }> = [];

    for (const [metricName, measurements] of Object.entries(filteredMeasurements)) {
      measurements.forEach(measurement => {
        if (measurement.alert_status !== 'green') {
          recentBreaches.push({
            metric: metricName,
            timestamp: measurement.timestamp,
            severity: measurement.alert_status === 'red' ? 'critical' : 'warning',
            duration_minutes: 5 // Approximation based on measurement window
          });
        }
      });
    }

    // Generate recommendations
    const recommendations: string[] = [];
    sloSummaries.forEach(summary => {
      if (summary.current_status === 'red') {
        recommendations.push(`CRITICAL: ${summary.metric_name} is breaching SLO targets. Immediate attention required.`);
      } else if (summary.trend.trend_direction === 'degrading' && summary.trend.confidence > 0.7) {
        recommendations.push(`WARNING: ${summary.metric_name} shows degrading trend. Consider investigation.`);
      }
      
      if (summary.error_budget_consumed > 80) {
        recommendations.push(`ERROR BUDGET: ${summary.metric_name} has consumed ${summary.error_budget_consumed.toFixed(1)}% of error budget.`);
      }
    });

    const report: SLOReport = {
      timestamp: endTime.toISOString(),
      version: '1.0.0',
      report_period: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        duration_hours: periodHours
      },
      overall_health: {
        status: overallStatus,
        availability_score: availabilityScore,
        error_budget_remaining: errorBudgetRemaining
      },
      slo_summaries: sloSummaries,
      detailed_measurements: filteredMeasurements,
      alerts: {
        active_alerts: recentBreaches.filter(b => b.severity === 'critical').length,
        recent_breaches: recentBreaches.slice(-10) // Last 10 breaches
      },
      recommendations
    };

    logger.info('Generated SLO report', {
      period_hours: periodHours,
      overall_status: overallStatus,
      slo_count: sloSummaries.length,
      availability_score: availabilityScore.toFixed(2),
      recommendations_count: recommendations.length
    });

    return report;
  }

  /**
   * Generate dashboard-compatible SLO data
   */
  public async generateDashboardData(): Promise<DashboardSLOData> {
    const measurements = sloMonitor.exportMeasurements();
    const config = sloMonitor.getConfig();

    // Helper function to get latest measurement
    const getLatest = (metricName: string): SLOMeasurement | null => {
      const metricMeasurements = measurements[metricName];
      return metricMeasurements && metricMeasurements.length > 0
        ? metricMeasurements[metricMeasurements.length - 1]
        : null;
    };

    // Helper function to get target from config
    const getTarget = (metricName: string): number => {
      return config.slo_targets[metricName]?.targets?.p95 || 0;
    };

    const dashboardData: DashboardSLOData = {
      timestamp: new Date().toISOString(),
      slo_status: {
        ingest_to_processed: {
          status: getLatest('ingest_to_processed_latency')?.alert_status || 'green',
          current_p95: getLatest('ingest_to_processed_latency')?.latencies?.p95 || 0,
          target_p95: getTarget('ingest_to_processed_latency'),
          compliance_percentage: (getLatest('ingest_to_processed_latency')?.slo_compliance?.overall_score || 1) * 100
        },
        processed_to_promoted: {
          status: getLatest('processed_to_promoted_latency')?.alert_status || 'green',
          current_p95: getLatest('processed_to_promoted_latency')?.latencies?.p95 || 0,
          target_p95: getTarget('processed_to_promoted_latency'),
          compliance_percentage: (getLatest('processed_to_promoted_latency')?.slo_compliance?.overall_score || 1) * 100
        },
        end_to_end: {
          status: getLatest('end_to_end_latency')?.alert_status || 'green',
          current_p95: getLatest('end_to_end_latency')?.latencies?.p95 || 0,
          target_p95: getTarget('end_to_end_latency'),
          compliance_percentage: (getLatest('end_to_end_latency')?.slo_compliance?.overall_score || 1) * 100
        }
      },
      trends: {},
      error_budget: {
        consumed_percentage: 0,
        remaining_days: 30,
        burn_rate: 0
      }
    };

    // Generate trend data for each metric
    for (const [metricName, metricMeasurements] of Object.entries(measurements)) {
      if (metricMeasurements.length > 0) {
        dashboardData.trends[metricName] = metricMeasurements.slice(-48).map(m => ({
          timestamp: m.timestamp,
          p95_latency: m.latencies.p95,
          compliance_score: m.slo_compliance.overall_score
        }));

        // Update error budget info (use worst case across all metrics)
        const latestMeasurement = metricMeasurements[metricMeasurements.length - 1];
        if (latestMeasurement.burn_rate.budget_consumed > dashboardData.error_budget.consumed_percentage / 100) {
          dashboardData.error_budget.consumed_percentage = latestMeasurement.burn_rate.budget_consumed * 100;
          dashboardData.error_budget.burn_rate = latestMeasurement.burn_rate.long_window;
          
          // Estimate remaining days based on current burn rate
          const remainingBudget = 1 - latestMeasurement.burn_rate.budget_consumed;
          const dailyBurnRate = latestMeasurement.burn_rate.long_window * 24; // Convert hourly to daily
          dashboardData.error_budget.remaining_days = dailyBurnRate > 0 
            ? Math.max(0, Math.floor(remainingBudget / dailyBurnRate))
            : 30;
        }
      }
    }

    return dashboardData;
  }

  /**
   * Export SLO report to file system
   */
  public async exportReport(report: SLOReport, filename?: string): Promise<string> {
    await fs.mkdir(this.outputDir, { recursive: true });
    
    const reportFilename = filename || `slo-report-${new Date().toISOString().slice(0, 10)}.json`;
    const reportPath = path.join(this.outputDir, reportFilename);
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    logger.info('Exported SLO report', {
      file_path: reportPath,
      overall_status: report.overall_health.status,
      slo_count: report.slo_summaries.length
    });

    return reportPath;
  }

  /**
   * Export dashboard SLO data to standard location
   */
  public async exportDashboardData(dashboardData: DashboardSLOData): Promise<string> {
    await fs.mkdir(this.outputDir, { recursive: true });
    
    const filePath = path.join(this.outputDir, 'slo.json');
    await fs.writeFile(filePath, JSON.stringify(dashboardData, null, 2));
    
    logger.debug('Exported dashboard SLO data', {
      file_path: filePath,
      timestamp: dashboardData.timestamp
    });

    return filePath;
  }

  /**
   * Generate and export complete SLO package
   */
  public async generateAndExportAll(periodHours: number = 24): Promise<{
    report_path: string;
    dashboard_path: string;
  }> {
    const [report, dashboardData] = await Promise.all([
      this.generateReport(periodHours),
      this.generateDashboardData()
    ]);

    const [reportPath, dashboardPath] = await Promise.all([
      this.exportReport(report),
      this.exportDashboardData(dashboardData)
    ]);

    logger.info('Generated and exported complete SLO package', {
      report_path: reportPath,
      dashboard_path: dashboardPath,
      overall_status: report.overall_health.status
    });

    return {
      report_path: reportPath,
      dashboard_path: dashboardPath
    };
  }
}

// Export singleton instance
export const sloReporter = new SLOReporter();