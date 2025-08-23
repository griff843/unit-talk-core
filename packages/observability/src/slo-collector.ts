import { logger } from './index.js';
import { sloMonitor, LatencyDataPoint } from './slo-monitor.js';

/**
 * SLO Data Collector Service
 * 
 * Collects latency data from the database and coordinates with SLO Monitor
 * for real-time latency measurement across the Unit Talk pipeline.
 */

export interface DatabaseQuery {
  query: string;
  params?: any[];
}

export interface SLOCollectorConfig {
  collection_interval: number; // milliseconds
  batch_size: number;
  max_lookback_window: number; // milliseconds  
}

export class SLOCollector {
  private config: SLOCollectorConfig;
  private isCollecting: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private dbClient: any; // Will be injected

  constructor(config?: Partial<SLOCollectorConfig>) {
    this.config = {
      collection_interval: 30000, // 30 seconds
      batch_size: 1000,
      max_lookback_window: 6 * 60 * 60 * 1000, // 6 hours
      ...config
    };
  }

  /**
   * Set database client for queries
   */
  public setDatabaseClient(client: any): void {
    this.dbClient = client;
  }

  /**
   * Generate SQL query to collect latency data points
   */
  private generateLatencyQuery(windowMinutes: number = 60): DatabaseQuery {
    const query = `
      SELECT 
        rp.id,
        rp.inserted_at,
        rp.processed_at,
        up.promoted_at
      FROM raw_props rp
      LEFT JOIN unified_picks up ON rp.id = up.raw_id
      WHERE rp.inserted_at >= NOW() - INTERVAL '${windowMinutes} minutes'
      ORDER BY rp.inserted_at DESC
      LIMIT $1
    `;

    return {
      query,
      params: [this.config.batch_size]
    };
  }

  /**
   * Execute database query to collect latency data
   */
  private async queryLatencyData(): Promise<LatencyDataPoint[]> {
    if (!this.dbClient) {
      throw new Error('Database client not configured');
    }

    const windowMinutes = Math.ceil(this.config.max_lookback_window / 60000);
    const { query, params } = this.generateLatencyQuery(windowMinutes);

    try {
      const startTime = Date.now();
      const result = await this.dbClient.query(query, params);
      const duration = Date.now() - startTime;

      logger.debug('Collected latency data from database', {
        query_duration_ms: duration,
        rows_collected: result.rows?.length || result.length || 0,
        window_minutes: windowMinutes
      });

      // Normalize result format (handle different DB client formats)
      const rows = result.rows || result;
      
      return rows.map((row: any) => ({
        id: row.id,
        inserted_at: new Date(row.inserted_at),
        processed_at: row.processed_at ? new Date(row.processed_at) : null,
        promoted_at: row.promoted_at ? new Date(row.promoted_at) : null
      }));

    } catch (error) {
      logger.error('Failed to collect latency data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: query.replace(/\s+/g, ' ').trim()
      });
      throw error;
    }
  }

  /**
   * Process collected data and update SLO measurements
   */
  private async processLatencyData(): Promise<void> {
    try {
      const dataPoints = await this.queryLatencyData();
      
      if (dataPoints.length === 0) {
        logger.warn('No latency data points collected');
        return;
      }

      logger.info('Processing latency data for SLO measurement', {
        total_points: dataPoints.length,
        with_processed: dataPoints.filter(p => p.processed_at).length,
        with_promoted: dataPoints.filter(p => p.promoted_at).length
      });

      // Measure all SLOs
      const measurements = await sloMonitor.measureAllSLOs(dataPoints);

      // Log summary of measurements
      logger.info('SLO measurements completed', {
        ingest_to_processed: {
          samples: measurements.ingest_to_processed.sample_count,
          p95: measurements.ingest_to_processed.latencies.p95,
          status: measurements.ingest_to_processed.alert_status
        },
        processed_to_promoted: {
          samples: measurements.processed_to_promoted.sample_count,
          p95: measurements.processed_to_promoted.latencies.p95,
          status: measurements.processed_to_promoted.alert_status
        },
        end_to_end: {
          samples: measurements.end_to_end.sample_count,
          p95: measurements.end_to_end.latencies.p95,
          status: measurements.end_to_end.alert_status
        }
      });

      // Check for alerts
      const alertStatuses = [
        measurements.ingest_to_processed.alert_status,
        measurements.processed_to_promoted.alert_status,
        measurements.end_to_end.alert_status
      ];

      if (alertStatuses.includes('red')) {
        logger.error('SLO BREACH DETECTED - Critical latency violations', {
          breached_slos: [
            ...(measurements.ingest_to_processed.alert_status === 'red' ? ['ingest_to_processed'] : []),
            ...(measurements.processed_to_promoted.alert_status === 'red' ? ['processed_to_promoted'] : []),
            ...(measurements.end_to_end.alert_status === 'red' ? ['end_to_end'] : [])
          ]
        });
      } else if (alertStatuses.includes('yellow')) {
        logger.warn('SLO WARNING - Latency approaching thresholds', {
          warning_slos: [
            ...(measurements.ingest_to_processed.alert_status === 'yellow' ? ['ingest_to_processed'] : []),
            ...(measurements.processed_to_promoted.alert_status === 'yellow' ? ['processed_to_promoted'] : []),
            ...(measurements.end_to_end.alert_status === 'yellow' ? ['end_to_end'] : [])
          ]
        });
      }

    } catch (error) {
      logger.error('Failed to process latency data for SLO measurement', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Start continuous SLO data collection
   */
  public start(): void {
    if (this.isCollecting) {
      logger.warn('SLO collector already running');
      return;
    }

    if (!this.dbClient) {
      throw new Error('Database client must be configured before starting collector');
    }

    this.isCollecting = true;
    
    logger.info('Starting SLO data collector', {
      collection_interval_ms: this.config.collection_interval,
      batch_size: this.config.batch_size,
      lookback_window_hours: this.config.max_lookback_window / (60 * 60 * 1000)
    });

    // Run initial collection
    this.processLatencyData().catch(error => {
      logger.error('Initial SLO data collection failed', { error: error.message });
    });

    // Start periodic collection
    this.intervalId = setInterval(() => {
      this.processLatencyData().catch(error => {
        logger.error('Periodic SLO data collection failed', { error: error.message });
      });
    }, this.config.collection_interval);
  }

  /**
   * Stop SLO data collection
   */
  public stop(): void {
    if (!this.isCollecting) {
      return;
    }

    this.isCollecting = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Stopped SLO data collector');
  }

  /**
   * Collect SLO data on-demand (for testing or manual triggers)
   */
  public async collectOnce(): Promise<void> {
    logger.info('Running on-demand SLO data collection');
    await this.processLatencyData();
  }

  /**
   * Get current collector configuration
   */
  public getConfig(): SLOCollectorConfig {
    return { ...this.config };
  }

  /**
   * Update collector configuration (restart required for interval changes)
   */
  public updateConfig(newConfig: Partial<SLOCollectorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Updated SLO collector configuration', this.config);
  }

  /**
   * Check if collector is currently running
   */
  public isRunning(): boolean {
    return this.isCollecting;
  }

  /**
   * Get collector health status
   */
  public getHealthStatus(): {
    running: boolean;
    db_connected: boolean;
    last_collection_success: boolean;
    config: SLOCollectorConfig;
  } {
    return {
      running: this.isCollecting,
      db_connected: !!this.dbClient,
      last_collection_success: true, // Would track actual success state in production
      config: this.config
    };
  }
}

// Export singleton instance
export const sloCollector = new SLOCollector();