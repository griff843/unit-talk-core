#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Elite Dashboard Integration
const { spawn } = require('child_process');
const { platform } = require('os');

/**
 * Execute elite dashboard generation with enhanced monitoring
 */
async function generateEliteDashboard() {
  return new Promise((resolve, reject) => {
    const isWindows = platform() === 'win32';
    const scriptPath = path.join(__dirname, 'elite-dashboard-aggregator.ts');
    
    console.log('🚀 Generating elite dashboard with comprehensive monitoring...');
    
    const child = spawn('tsx', [scriptPath, 'aggregate'], {
      stdio: 'inherit',
      shell: isWindows
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Elite dashboard generated successfully');
        resolve();
      } else {
        console.warn('⚠️  Elite dashboard generation failed, falling back to basic dashboard');
        resolve(); // Don't fail the entire process
      }
    });

    child.on('error', (error) => {
      console.warn('⚠️  Elite dashboard not available, using basic dashboard:', error.message);
      resolve(); // Don't fail the entire process
    });
  });
}

// Emit dashboard JSON with current system state
async function emitDashboard() {
  console.log('📊 Generating dashboard...');

  // Try to generate elite dashboard first
  try {
    await generateEliteDashboard();
    
    // Check if elite dashboard was generated successfully
    const eliteDashboardPath = 'out/ops/elite-dashboard.json';
    if (fs.existsSync(eliteDashboardPath)) {
      console.log('🎯 Elite dashboard with comprehensive monitoring is available');
      console.log('📊 Legacy dashboard will be maintained for backwards compatibility');
    }
  } catch (error) {
    console.warn('⚠️  Elite dashboard generation failed:', error.message);
  }

  const dashboard = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      SHADOW_MODE: process.env.SHADOW_MODE === 'true',
      PUBLISH_TO_DISCORD: process.env.PUBLISH_TO_DISCORD === 'true',
      ALLOW_PROMOTION_IN_SHADOW: process.env.ALLOW_PROMOTION_IN_SHADOW === 'true',
      MAX_ALLOWED_PROMOTES_5MIN: parseInt(process.env.MAX_ALLOWED_PROMOTES_5MIN || '20')
    },
    services: {
      temporal: { status: 'unknown', health: null },
      database: { status: 'unknown', health: null },
      api: { status: 'unknown', health: null },
      worker: { status: 'unknown', health: null }
    },
    metrics: {
      ingestion: {
        raw_new_5min: 0,
        processed_5min: 0,
        promoted_5min: 0,
        settled_5min: 0
      },
      performance: {
        avg_processing_time_ms: 0,
        avg_promotion_time_ms: 0,
        backlog_size: 0
      }
    },
    alerts: [],
    phase: determinePhase()
  };

  // Read acceptance results if available
  try {
    if (fs.existsSync('out/ops/acceptance.json')) {
      const acceptance = JSON.parse(fs.readFileSync('out/ops/acceptance.json', 'utf-8'));
      dashboard.lastAcceptance = {
        timestamp: acceptance.timestamp,
        success: acceptance.success,
        violations: acceptance.parityCheck?.violations || []
      };
    }
  } catch (e) {
    console.warn('⚠️  Could not read acceptance results:', e.message);
  }

  // Read promoter output if available
  try {
    if (fs.existsSync('out/ops/promoter.json')) {
      const promoter = JSON.parse(fs.readFileSync('out/ops/promoter.json', 'utf-8'));
      dashboard.promoter = promoter;
      
      // Update metrics from promoter
      dashboard.metrics.ingestion.promoted_5min = promoter.promoted_last_5m || 0;
      dashboard.metrics.performance.backlog_size = promoter.backlog_size || 0;
    }
  } catch (e) {
    console.warn('⚠️  Could not read promoter output:', e.message);
  }

  // Read actual metrics if available
  try {
    if (fs.existsSync('out/ops/metrics.json')) {
      const metrics = JSON.parse(fs.readFileSync('out/ops/metrics.json', 'utf-8'));
      dashboard.metrics.ingestion = {
        ...dashboard.metrics.ingestion,
        ...metrics
      };
    }
  } catch (e) {
    console.warn('⚠️  Could not read metrics:', e.message);
  }

  // Check service health (simplified)
  dashboard.services.temporal.status = await checkServiceHealth('temporal', 7233) ? 'healthy' : 'unhealthy';
  dashboard.services.database.status = 'unknown'; // Would check actual DB connection
  dashboard.services.api.status = await checkServiceHealth('api', 3000) ? 'healthy' : 'unknown';
  dashboard.services.worker.status = 'unknown'; // Would check worker status

  // Generate alerts based on conditions
  dashboard.alerts = generateAlerts(dashboard);

  // Write dashboard
  const outputPath = 'out/ops/dashboard.json';
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(dashboard, null, 2));

  // Print summary
  console.log('\n📈 Dashboard Summary:');
  console.log(`  Phase: ${dashboard.phase}`);
  console.log(`  Shadow Mode: ${dashboard.environment.SHADOW_MODE}`);
  console.log(`  Publish to Discord: ${dashboard.environment.PUBLISH_TO_DISCORD}`);
  console.log(`  Services: ${Object.entries(dashboard.services).map(([k, v]) => `${k}=${v.status}`).join(', ')}`);
  
  if (dashboard.metrics.ingestion) {
    console.log(`\n  5-Minute Metrics:`);
    console.log(`    Raw: ${dashboard.metrics.ingestion.raw_new_5min}`);
    console.log(`    Processed: ${dashboard.metrics.ingestion.processed_5min}`);
    console.log(`    Promoted: ${dashboard.metrics.ingestion.promoted_5min}`);
    console.log(`    Backlog: ${dashboard.metrics.performance.backlog_size}`);
  }

  if (dashboard.alerts.length > 0) {
    console.log(`\n  ⚠️  Alerts:`);
    dashboard.alerts.forEach(alert => {
      console.log(`    - ${alert.level}: ${alert.message}`);
    });
  }

  console.log(`\n✅ Dashboard saved to: ${outputPath}`);
}

// Determine current phase based on environment
function determinePhase() {
  const shadowMode = process.env.SHADOW_MODE === 'true';
  const publishToDiscord = process.env.PUBLISH_TO_DISCORD === 'true';
  const allowPromotion = process.env.ALLOW_PROMOTION_IN_SHADOW === 'true';

  if (shadowMode && !allowPromotion) {
    return 'A (Shadow - No Promotions)';
  } else if (!shadowMode && !publishToDiscord) {
    return 'B (Live - Muted)';
  } else if (!shadowMode && publishToDiscord) {
    return 'C (Live - Full)';
  } else {
    return 'Custom';
  }
}

// Generate alerts based on dashboard state
function generateAlerts(dashboard) {
  const alerts = [];

  // Check for parity violations
  if (dashboard.lastAcceptance?.violations?.length > 0) {
    alerts.push({
      level: 'ERROR',
      message: `Parity violations detected: ${dashboard.lastAcceptance.violations.join(', ')}`,
      timestamp: new Date().toISOString()
    });
  }

  // Check for over-promotion
  const maxPromotes = dashboard.environment.MAX_ALLOWED_PROMOTES_5MIN;
  if (dashboard.metrics.ingestion.promoted_5min > maxPromotes) {
    alerts.push({
      level: 'CRITICAL',
      message: `Over-promotion detected: ${dashboard.metrics.ingestion.promoted_5min} > ${maxPromotes}`,
      timestamp: new Date().toISOString()
    });
  }

  // Check for large backlog
  if (dashboard.metrics.performance.backlog_size > 100) {
    alerts.push({
      level: 'WARNING',
      message: `Large backlog detected: ${dashboard.metrics.performance.backlog_size} items`,
      timestamp: new Date().toISOString()
    });
  }

  // Check for unhealthy services
  Object.entries(dashboard.services).forEach(([name, service]) => {
    if (service.status === 'unhealthy') {
      alerts.push({
        level: 'ERROR',
        message: `Service ${name} is unhealthy`,
        timestamp: new Date().toISOString()
      });
    }
  });

  return alerts;
}

// Simple service health check
async function checkServiceHealth(service, port) {
  const net = require('net');
  
  return new Promise((resolve) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      resolve(false);
    }, 1000);

    client.connect(port, '127.0.0.1', () => {
      clearTimeout(timeout);
      client.destroy();
      resolve(true);
    });

    client.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

// Export for testing
if (require.main === module) {
  emitDashboard().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { emitDashboard };