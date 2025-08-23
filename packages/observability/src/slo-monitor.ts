import { logger } from './index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * SLO Monitoring Service for Unit Talk Pipeline
 * 
 * Measures latency across pipeline stages:
 * - Ingest → Processed: raw_props.inserted_at to raw_props.processed_at  
 * - Processed → Promoted: raw_props.processed_at to unified_picks.promoted_at
 * - End-to-End: raw_props.inserted_at to unified_picks.promoted_at
 * 
 * Based on Temporal monitoring patterns for comprehensive SLO implementation.
 */

export interface SLOTarget {
  p50: number;
  p95: number;
  p99: number;
}

export interface SLOBreachThresholds {
  warning: number;
  critical: number;
}

export interface SLOMeasurement {
  metric_name: string;
  timestamp: string;
  window_start: string;
  window_end: string;
  sample_count: number;
  latencies: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    max: number;
  };
  slo_compliance: {
    p50_compliant: boolean;
    p95_compliant: boolean;
    p99_compliant: boolean;
    overall_score: number;
  };
  burn_rate: {
    short_window: number;
    long_window: number;
    budget_consumed: number;
  };
  alert_status: 'green' | 'yellow' | 'red';
}

export interface SLOConfig {
  version: string;
  slo_targets: {
    [key: string]: {
      description: string;
      unit: string;
      targets: SLOTarget;
      breach_thresholds: SLOBreachThresholds;
      measurement_window: string;
      burn_rate_windows: {
        short: string;
        long: string;
      };
    };
  };
  alerting_config: any;
  error_budget: any;
  dashboard_config: any;
  data_retention: any;
}

export interface LatencyDataPoint {
  id: string;
  inserted_at: Date;
  processed_at: Date | null;
  promoted_at: Date | null;
}

export class SLOMonitor {
  private config: SLOConfig;
  private measurements: Map<string, SLOMeasurement[]> = new Map();

  constructor(configPath?: string) {
    this.loadConfig(configPath);
  }

  private async loadConfig(configPath?: string): Promise<void> {
    const defaultPath = path.join(process.cwd(), 'config', 'slo.json');
    const resolvedPath = configPath || defaultPath;

    try {
      const configContent = await fs.readFile(resolvedPath, 'utf-8');
      this.config = JSON.parse(configContent);
      logger.info('SLO configuration loaded', { path: resolvedPath });
    } catch (error) {
      logger.error('Failed to load SLO configuration', {
        path: resolvedPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Calculate percentiles from an array of latency values
   */
  private calculatePercentiles(values: number[]): {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    max: number;
  } {
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, max: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;

    const p50Index = Math.floor(len * 0.5);
    const p95Index = Math.floor(len * 0.95);
    const p99Index = Math.floor(len * 0.99);

    const p50 = sorted[Math.min(p50Index, len - 1)];
    const p95 = sorted[Math.min(p95Index, len - 1)];
    const p99 = sorted[Math.min(p99Index, len - 1)];
    
    const mean = values.reduce((sum, val) => sum + val, 0) / len;
    const max = Math.max(...values);

    return { p50, p95, p99, mean, max };
  }

  /**
   * Calculate burn rate based on SLO breach frequency
   */
  private calculateBurnRate(
    measurements: SLOMeasurement[],
    shortWindow: string,
    longWindow: string
  ): { short_window: number; long_window: number; budget_consumed: number } {
    // Convert time windows to milliseconds
    const parseWindow = (window: string): number => {
      const match = window.match(/(\d+)([smhd])/);
      if (!match) return 3600000; // Default 1 hour

      const [, amount, unit] = match;
      const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      return parseInt(amount) * (multipliers[unit as keyof typeof multipliers] || 60000);
    };

    const shortMs = parseWindow(shortWindow);
    const longMs = parseWindow(longWindow);
    const now = Date.now();

    // Filter measurements within time windows
    const shortWindowMeasurements = measurements.filter(
      m => now - new Date(m.timestamp).getTime() <= shortMs
    );
    const longWindowMeasurements = measurements.filter(
      m => now - new Date(m.timestamp).getTime() <= longMs
    );

    // Calculate breach rates
    const shortBurnRate = shortWindowMeasurements.length > 0 
      ? shortWindowMeasurements.filter(m => m.alert_status === 'red').length / shortWindowMeasurements.length
      : 0;

    const longBurnRate = longWindowMeasurements.length > 0
      ? longWindowMeasurements.filter(m => m.alert_status === 'red').length / longWindowMeasurements.length
      : 0;

    // Estimate monthly budget consumption
    const budgetConsumed = longBurnRate * 30; // Approximate monthly consumption

    return {
      short_window: shortBurnRate,
      long_window: longBurnRate,
      budget_consumed: Math.min(budgetConsumed, 1.0)
    };
  }

  /**
   * Measure ingest to processed latency
   */
  public async measureIngestToProcessedLatency(dataPoints: LatencyDataPoint[]): Promise<SLOMeasurement> {
    const metricName = 'ingest_to_processed_latency';
    const config = this.config.slo_targets[metricName];
    const now = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

    // Filter data points with both timestamps
    const validPoints = dataPoints.filter(
      point => point.processed_at && point.inserted_at
    );

    // Calculate latencies in seconds
    const latencies = validPoints.map(point => 
      (point.processed_at!.getTime() - point.inserted_at.getTime()) / 1000
    );

    const percentiles = this.calculatePercentiles(latencies);

    // Check SLO compliance
    const sloCompliance = {
      p50_compliant: percentiles.p50 <= config.targets.p50,
      p95_compliant: percentiles.p95 <= config.targets.p95,
      p99_compliant: percentiles.p99 <= config.targets.p99,
      overall_score: 0
    };

    // Calculate overall compliance score
    const complianceCount = [
      sloCompliance.p50_compliant,
      sloCompliance.p95_compliant,
      sloCompliance.p99_compliant
    ].filter(Boolean).length;
    sloCompliance.overall_score = complianceCount / 3;

    // Determine alert status
    let alertStatus: 'green' | 'yellow' | 'red' = 'green';
    if (sloCompliance.overall_score < 0.5) {
      alertStatus = 'red';
    } else if (sloCompliance.overall_score < 0.8) {
      alertStatus = 'yellow';
    }

    // Get historical measurements for burn rate calculation
    const historicalMeasurements = this.measurements.get(metricName) || [];
    const burnRate = this.calculateBurnRate(
      historicalMeasurements,
      config.burn_rate_windows.short,
      config.burn_rate_windows.long
    );

    const measurement: SLOMeasurement = {
      metric_name: metricName,
      timestamp: now.toISOString(),
      window_start: windowStart.toISOString(),
      window_end: now.toISOString(),
      sample_count: latencies.length,
      latencies: percentiles,
      slo_compliance: sloCompliance,
      burn_rate: burnRate,
      alert_status: alertStatus
    };

    // Store measurement
    if (!this.measurements.has(metricName)) {
      this.measurements.set(metricName, []);
    }
    this.measurements.get(metricName)!.push(measurement);

    logger.info('Measured ingest-to-processed latency', {
      sample_count: latencies.length,
      p50: percentiles.p50,
      p95: percentiles.p95,
      compliance_score: sloCompliance.overall_score,
      alert_status: alertStatus
    });

    return measurement;
  }

  /**
   * Measure processed to promoted latency
   */
  public async measureProcessedToPromotedLatency(dataPoints: LatencyDataPoint[]): Promise<SLOMeasurement> {
    const metricName = 'processed_to_promoted_latency';
    const config = this.config.slo_targets[metricName];
    const now = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

    // Filter data points with all required timestamps
    const validPoints = dataPoints.filter(
      point => point.promoted_at && point.processed_at
    );

    // Calculate latencies in seconds
    const latencies = validPoints.map(point => 
      (point.promoted_at!.getTime() - point.processed_at!.getTime()) / 1000
    );

    const percentiles = this.calculatePercentiles(latencies);

    const sloCompliance = {
      p50_compliant: percentiles.p50 <= config.targets.p50,
      p95_compliant: percentiles.p95 <= config.targets.p95,
      p99_compliant: percentiles.p99 <= config.targets.p99,
      overall_score: 0
    };

    const complianceCount = [
      sloCompliance.p50_compliant,
      sloCompliance.p95_compliant,
      sloCompliance.p99_compliant
    ].filter(Boolean).length;
    sloCompliance.overall_score = complianceCount / 3;

    let alertStatus: 'green' | 'yellow' | 'red' = 'green';
    if (sloCompliance.overall_score < 0.5) {
      alertStatus = 'red';
    } else if (sloCompliance.overall_score < 0.8) {
      alertStatus = 'yellow';
    }

    const historicalMeasurements = this.measurements.get(metricName) || [];
    const burnRate = this.calculateBurnRate(
      historicalMeasurements,
      config.burn_rate_windows.short,
      config.burn_rate_windows.long
    );

    const measurement: SLOMeasurement = {
      metric_name: metricName,
      timestamp: now.toISOString(),
      window_start: windowStart.toISOString(),
      window_end: now.toISOString(),
      sample_count: latencies.length,
      latencies: percentiles,
      slo_compliance: sloCompliance,
      burn_rate: burnRate,
      alert_status: alertStatus
    };

    if (!this.measurements.has(metricName)) {
      this.measurements.set(metricName, []);
    }
    this.measurements.get(metricName)!.push(measurement);

    logger.info('Measured processed-to-promoted latency', {
      sample_count: latencies.length,
      p50: percentiles.p50,
      p95: percentiles.p95,
      compliance_score: sloCompliance.overall_score,
      alert_status: alertStatus
    });

    return measurement;
  }

  /**
   * Measure end-to-end pipeline latency
   */
  public async measureEndToEndLatency(dataPoints: LatencyDataPoint[]): Promise<SLOMeasurement> {
    const metricName = 'end_to_end_latency';
    const config = this.config.slo_targets[metricName];
    const now = new Date();
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

    // Filter data points with all required timestamps
    const validPoints = dataPoints.filter(
      point => point.promoted_at && point.inserted_at
    );

    // Calculate latencies in seconds
    const latencies = validPoints.map(point => 
      (point.promoted_at!.getTime() - point.inserted_at.getTime()) / 1000
    );

    const percentiles = this.calculatePercentiles(latencies);

    const sloCompliance = {
      p50_compliant: percentiles.p50 <= config.targets.p50,
      p95_compliant: percentiles.p95 <= config.targets.p95,
      p99_compliant: percentiles.p99 <= config.targets.p99,
      overall_score: 0
    };

    const complianceCount = [
      sloCompliance.p50_compliant,
      sloCompliance.p95_compliant,
      sloCompliance.p99_compliant
    ].filter(Boolean).length;
    sloCompliance.overall_score = complianceCount / 3;

    let alertStatus: 'green' | 'yellow' | 'red' = 'green';
    if (sloCompliance.overall_score < 0.5) {
      alertStatus = 'red';
    } else if (sloCompliance.overall_score < 0.8) {
      alertStatus = 'yellow';
    }

    const historicalMeasurements = this.measurements.get(metricName) || [];
    const burnRate = this.calculateBurnRate(
      historicalMeasurements,
      config.burn_rate_windows.short,
      config.burn_rate_windows.long
    );

    const measurement: SLOMeasurement = {
      metric_name: metricName,
      timestamp: now.toISOString(),
      window_start: windowStart.toISOString(),
      window_end: now.toISOString(),
      sample_count: latencies.length,
      latencies: percentiles,
      slo_compliance: sloCompliance,
      burn_rate: burnRate,
      alert_status: alertStatus
    };

    if (!this.measurements.has(metricName)) {
      this.measurements.set(metricName, []);
    }
    this.measurements.get(metricName)!.push(measurement);

    logger.info('Measured end-to-end pipeline latency', {
      sample_count: latencies.length,
      p50: percentiles.p50,
      p95: percentiles.p95,
      compliance_score: sloCompliance.overall_score,
      alert_status: alertStatus
    });

    return measurement;
  }

  /**
   * Run complete SLO measurement cycle
   */
  public async measureAllSLOs(dataPoints: LatencyDataPoint[]): Promise<{
    ingest_to_processed: SLOMeasurement;
    processed_to_promoted: SLOMeasurement;
    end_to_end: SLOMeasurement;
  }> {
    const [ingestToProcessed, processedToPromoted, endToEnd] = await Promise.all([
      this.measureIngestToProcessedLatency(dataPoints),
      this.measureProcessedToPromotedLatency(dataPoints),
      this.measureEndToEndLatency(dataPoints)
    ]);

    return {
      ingest_to_processed: ingestToProcessed,
      processed_to_promoted: processedToPromoted,
      end_to_end: endToEnd
    };
  }

  /**
   * Get historical measurements for a specific metric
   */
  public getHistoricalMeasurements(metricName: string): SLOMeasurement[] {
    return this.measurements.get(metricName) || [];
  }

  /**
   * Export all measurements to JSON
   */
  public exportMeasurements(): { [metricName: string]: SLOMeasurement[] } {
    const result: { [metricName: string]: SLOMeasurement[] } = {};
    for (const [metricName, measurements] of this.measurements.entries()) {
      result[metricName] = measurements;
    }
    return result;
  }

  /**
   * Get current SLO configuration
   */
  public getConfig(): SLOConfig {
    return this.config;
  }

  /**
   * Clean up old measurements based on retention policy
   */
  public cleanupOldMeasurements(): void {
    const retentionMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoffTime = Date.now() - retentionMs;

    for (const [metricName, measurements] of this.measurements.entries()) {
      const filteredMeasurements = measurements.filter(
        m => new Date(m.timestamp).getTime() >= cutoffTime
      );
      this.measurements.set(metricName, filteredMeasurements);
    }

    logger.debug('Cleaned up old SLO measurements', { cutoff_time: new Date(cutoffTime).toISOString() });
  }
}

// Export singleton instance
export const sloMonitor = new SLOMonitor();