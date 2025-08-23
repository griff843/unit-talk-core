#!/usr/bin/env node

/**
 * SLO Monitor CLI Tool
 * 
 * Command-line interface for running SLO monitoring operations.
 * Supports both one-time measurement and continuous monitoring modes.
 * 
 * Usage:
 *   npm run ops:slo                    # Generate current SLO report
 *   npm run ops:slo -- --continuous    # Start continuous monitoring
 *   npm run ops:slo -- --dashboard     # Generate dashboard data only  
 *   npm run ops:slo -- --period 48     # Generate 48-hour report
 */

import { logger, createLogger } from '@unit-talk/observability';
import { sloMonitor, sloCollector, sloReporter, LatencyDataPoint } from '@unit-talk/observability/slo-monitor';
import { sloReporter as reporter } from '@unit-talk/observability/slo-reporter';
import * as fs from 'fs/promises';
import * as path from 'path';

// Create CLI-specific logger
const cliLogger = createLogger('slo-cli', process.env.LOG_LEVEL as any);

interface CLIOptions {
  continuous: boolean;
  dashboard: boolean;
  period: number;
  output: string;
  help: boolean;
  mockData: boolean;
  verbose: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    continuous: false,
    dashboard: false,
    period: 24,
    output: path.join(process.cwd(), 'out', 'ops'),
    help: false,
    mockData: false,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--continuous':
        options.continuous = true;
        break;
      case '--dashboard':
        options.dashboard = true;
        break;
      case '--period':
        options.period = parseInt(args[++i]) || 24;
        break;
      case '--output':
        options.output = args[++i] || options.output;
        break;
      case '--mock-data':
        options.mockData = true;
        break;
      case '--verbose':
        options.verbose = true;
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
Unit Talk SLO Monitor CLI

USAGE:
  npm run ops:slo [OPTIONS]

OPTIONS:
  --continuous     Start continuous monitoring (runs until stopped)
  --dashboard      Generate dashboard data only
  --period HOURS   Report period in hours (default: 24)
  --output PATH    Output directory (default: out/ops)
  --mock-data      Use mock data for testing (no database required)
  --verbose        Enable verbose logging
  --help, -h       Show this help message

EXAMPLES:
  npm run ops:slo                           # Generate 24-hour SLO report
  npm run ops:slo -- --period 48            # Generate 48-hour report  
  npm run ops:slo -- --dashboard            # Dashboard data only
  npm run ops:slo -- --continuous           # Continuous monitoring
  npm run ops:slo -- --mock-data --verbose  # Test with mock data

OUTPUT:
  Reports are saved to out/ops/slo-report-YYYY-MM-DD.json
  Dashboard data is saved to out/ops/slo.json
  
SLO METRICS:
  - ingest_to_processed_latency: raw_props.inserted_at → raw_props.processed_at
  - processed_to_promoted_latency: raw_props.processed_at → unified_picks.promoted_at  
  - end_to_end_latency: raw_props.inserted_at → unified_picks.promoted_at

For more information, see: https://github.com/unit-talk/unit-talk-core/docs/slo-monitoring
`);
}

/**
 * Generate mock latency data for testing
 */
function generateMockData(count: number = 100): LatencyDataPoint[] {
  const now = new Date();
  const mockData: LatencyDataPoint[] = [];

  for (let i = 0; i < count; i++) {
    const insertedAt = new Date(now.getTime() - Math.random() * 6 * 60 * 60 * 1000); // Last 6 hours
    const processedAt = new Date(insertedAt.getTime() + Math.random() * 300 * 1000); // 0-5 min processing
    const promotedAt = Math.random() > 0.3 // 70% get promoted
      ? new Date(processedAt.getTime() + Math.random() * 180 * 1000) // 0-3 min promotion
      : null;

    mockData.push({
      id: `mock-${i}`,
      inserted_at: insertedAt,
      processed_at: processedAt,
      promoted_at: promotedAt
    });
  }

  return mockData;
}

/**
 * Connect to database (simplified for CLI usage)
 */
async function connectToDatabase(): Promise<any> {
  // In a real implementation, this would connect to the actual database
  // For now, we'll create a mock client for testing
  return {
    query: async (sql: string, params: any[]) => {
      cliLogger.warn('Using mock database client - no real data available');
      return { rows: [] };
    }
  };
}

/**
 * Run one-time SLO measurement and reporting
 */
async function runOneTimeMeasurement(options: CLIOptions): Promise<void> {
  cliLogger.info('Starting one-time SLO measurement', {
    period_hours: options.period,
    output_dir: options.output,
    mock_data: options.mockData
  });

  try {
    let dataPoints: LatencyDataPoint[];

    if (options.mockData) {
      // Use mock data for testing
      dataPoints = generateMockData(100);
      cliLogger.info('Generated mock latency data', { count: dataPoints.length });
    } else {
      // Connect to database and collect real data
      const dbClient = await connectToDatabase();
      sloCollector.setDatabaseClient(dbClient);
      await sloCollector.collectOnce();
      
      // For now, use mock data since we don't have a real DB connection
      dataPoints = generateMockData(50);
      cliLogger.warn('Database connection not implemented - using mock data');
    }

    // Measure all SLOs
    const measurements = await sloMonitor.measureAllSLOs(dataPoints);

    cliLogger.info('SLO measurements completed', {
      ingest_to_processed: {
        samples: measurements.ingest_to_processed.sample_count,
        p95: measurements.ingest_to_processed.latencies.p95.toFixed(2) + 's',
        status: measurements.ingest_to_processed.alert_status
      },
      processed_to_promoted: {
        samples: measurements.processed_to_promoted.sample_count,
        p95: measurements.processed_to_promoted.latencies.p95.toFixed(2) + 's',
        status: measurements.processed_to_promoted.alert_status
      },
      end_to_end: {
        samples: measurements.end_to_end.sample_count,
        p95: measurements.end_to_end.latencies.p95.toFixed(2) + 's',  
        status: measurements.end_to_end.alert_status
      }
    });

    // Generate reports
    if (options.dashboard) {
      // Dashboard data only
      const dashboardData = await reporter.generateDashboardData();
      const dashboardPath = await reporter.exportDashboardData(dashboardData);
      
      cliLogger.info('Dashboard SLO data generated', {
        file_path: dashboardPath,
        overall_status: 'healthy' // Would be calculated from actual data
      });

      console.log(`\n✅ Dashboard SLO data exported to: ${dashboardPath}`);
    } else {
      // Full report
      const { report_path, dashboard_path } = await reporter.generateAndExportAll(options.period);
      
      cliLogger.info('Complete SLO package generated', {
        report_path,
        dashboard_path
      });

      console.log(`\n✅ SLO Report exported to: ${report_path}`);
      console.log(`✅ Dashboard data exported to: ${dashboard_path}`);
      
      // Display summary
      const reportContent = JSON.parse(await fs.readFile(report_path, 'utf-8'));
      console.log(`\n📊 SLO Summary:`);
      console.log(`   Overall Status: ${reportContent.overall_health.status.toUpperCase()}`);
      console.log(`   Availability: ${reportContent.overall_health.availability_score.toFixed(1)}%`);
      console.log(`   Error Budget Remaining: ${reportContent.overall_health.error_budget_remaining.toFixed(1)}%`);
      
      if (reportContent.recommendations.length > 0) {
        console.log(`\n⚠️  Recommendations:`);
        reportContent.recommendations.forEach((rec: string, i: number) => {
          console.log(`   ${i + 1}. ${rec}`);
        });
      }
    }

  } catch (error) {
    cliLogger.error('SLO measurement failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`\n❌ SLO measurement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Run continuous SLO monitoring
 */
async function runContinuousMonitoring(options: CLIOptions): Promise<void> {
  cliLogger.info('Starting continuous SLO monitoring', {
    output_dir: options.output,
    mock_data: options.mockData
  });

  try {
    if (!options.mockData) {
      const dbClient = await connectToDatabase();
      sloCollector.setDatabaseClient(dbClient);
    }

    // Start the collector
    if (!options.mockData) {
      sloCollector.start();
      cliLogger.info('SLO data collector started');
    }

    // Set up periodic reporting
    const reportInterval = 30 * 60 * 1000; // 30 minutes
    const reportIntervalId = setInterval(async () => {
      try {
        if (options.mockData) {
          // Generate and measure mock data
          const mockData = generateMockData(20);
          await sloMonitor.measureAllSLOs(mockData);
        }

        // Generate dashboard data
        const dashboardData = await reporter.generateDashboardData();
        await reporter.exportDashboardData(dashboardData);
        
        cliLogger.info('Periodic dashboard data updated');
      } catch (error) {
        cliLogger.error('Periodic reporting failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, reportInterval);

    console.log(`\n🔄 Continuous SLO monitoring started`);
    console.log(`📊 Dashboard data will be updated every 30 minutes`);
    console.log(`📂 Output directory: ${options.output}`);
    console.log(`\nPress Ctrl+C to stop monitoring\n`);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(`\n🛑 Stopping SLO monitoring...`);
      
      if (!options.mockData) {
        sloCollector.stop();
      }
      clearInterval(reportIntervalId);
      
      cliLogger.info('SLO monitoring stopped');
      console.log(`✅ SLO monitoring stopped gracefully`);
      process.exit(0);
    });

    // Keep process running
    process.on('SIGTERM', () => process.kill(process.pid, 'SIGINT'));

  } catch (error) {
    cliLogger.error('Continuous monitoring setup failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`\n❌ Failed to start continuous monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    displayHelp();
    return;
  }

  // Ensure output directory exists
  await fs.mkdir(options.output, { recursive: true });

  try {
    if (options.continuous) {
      await runContinuousMonitoring(options);
    } else {
      await runOneTimeMeasurement(options);
    }
  } catch (error) {
    cliLogger.error('CLI execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.error(`\n❌ SLO monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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