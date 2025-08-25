#!/usr/bin/env node
/* eslint-env node */


const fs = require('fs');
const path = require('path');

// Quiet hours checking function
function isCurrentlyQuietHours() {
  try {
    const start = process.env.QUIET_HOURS_START || '21:00';
    const end = process.env.QUIET_HOURS_END || '08:00';
    const timezone = process.env.TZ || 'America/New_York';
    
    const currentTime = new Date();
    const etFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const etTimeString = etFormatter.format(currentTime);
    const [hours, minutes] = etTimeString.split(':').map(num => parseInt(num, 10));
    const currentMinutes = hours * 60 + minutes;
    
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    
    // Handle overnight quiet hours (e.g., 21:00 to 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  } catch (error) {
    console.warn('Failed to check quiet hours:', error.message);
    return false;
  }
}

function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(num => parseInt(num, 10));
  return hours * 60 + minutes;
}

// Emit dashboard JSON with current system state
async function emitDashboard() {
  console.log('📊 Generating dashboard...');

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

  // Standardized 5min view under metrics and top-level
  dashboard.metrics.last5min = {
    raw_new_5min: dashboard.metrics.ingestion.raw_new_5min,
    processed_5min: dashboard.metrics.ingestion.processed_5min,
    promoted_5min: dashboard.metrics.ingestion.promoted_5min,
  };
  dashboard.last5min = { ...dashboard.metrics.last5min };

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

  // Add quiet hours status
  dashboard.quiet_hours = {
    start: process.env.QUIET_HOURS_START || '21:00',
    end: process.env.QUIET_HOURS_END || '08:00',
    timezone: process.env.TZ || 'America/New_York',
    active: isCurrentlyQuietHours()
  };
  
  // Read outbox stats if available
  try {
    const outboxDir = 'out/recaps/outbox';
    if (fs.existsSync(outboxDir)) {
      const files = fs.readdirSync(outboxDir).filter(f => f.endsWith('.json')).sort();
      if (files.length > 0) {
        const latestOutbox = JSON.parse(fs.readFileSync(path.join(outboxDir, files[files.length - 1]), 'utf-8'));
        dashboard.outbox = {
          last_flush: latestOutbox.timestamp || latestOutbox.flushed_at,
          messages_processed: latestOutbox.processed_count || 0,
          messages_failed: latestOutbox.failed_count || 0,
          duration_ms: latestOutbox.duration_ms || 0
        };
      }
    }
    
    // Also check pending outbox messages
    const pendingOutboxDir = 'out/ops/outbox';
    if (fs.existsSync(pendingOutboxDir)) {
      const pendingFiles = fs.readdirSync(pendingOutboxDir).filter(f => f.endsWith('.json'));
      dashboard.outbox = {
        ...dashboard.outbox,
        pending_count: pendingFiles.length
      };
    }
  } catch (e) {
    console.warn('⚠️  Could not read outbox stats:', e.message);
  }

  // Read actual metrics if available
  try {
    if (fs.existsSync('out/ops/metrics.json')) {
      const metrics = JSON.parse(fs.readFileSync('out/ops/metrics.json', 'utf-8'));
      dashboard.metrics.ingestion = {
        ...dashboard.metrics.ingestion,
        ...metrics
      };
      // Keep standardized last5min in sync and strip legacy keys if present
      dashboard.metrics.last5min = {
        raw_new_5min: dashboard.metrics.ingestion.raw_new_5min,
        processed_5min: dashboard.metrics.ingestion.processed_5min,
        promoted_5min: dashboard.metrics.ingestion.promoted_5min,
      };
      dashboard.last5min = { ...dashboard.metrics.last5min };
      delete dashboard.metrics.last_5min;
      delete dashboard.metrics.lastFiveMin;
    }
  } catch (e) {
    console.warn('⚠️  Could not read metrics:', e.message);
  }

  // Check service health - read from temporal-health.json if available
  try {
    const temporalHealthPath = 'out/ops/temporal-health.json';
    if (fs.existsSync(temporalHealthPath)) {
      const temporalHealth = JSON.parse(fs.readFileSync(temporalHealthPath, 'utf-8'));
      dashboard.services.temporal = {
        status: temporalHealth.up ? 'healthy' : 'unhealthy',
        health: {
          up: temporalHealth.up,
          serverVersion: temporalHealth.serverVersion,
          namespace: temporalHealth.namespace,
          address: temporalHealth.address,
          error: temporalHealth.error
        }
      };
    } else {
      dashboard.services.temporal.status = await checkServiceHealth('temporal', 7233) ? 'healthy' : 'unhealthy';
    }
  } catch (e) {
    console.warn('⚠️  Could not read temporal health:', e.message);
    dashboard.services.temporal.status = await checkServiceHealth('temporal', 7233) ? 'healthy' : 'unhealthy';
  }
  
  // Read health check files if available
  try {
    if (fs.existsSync('out/ops/health-db.json')) {
      const healthDb = JSON.parse(fs.readFileSync('out/ops/health-db.json', 'utf-8'));
      dashboard.services.database = {
        status: healthDb.up ? 'healthy' : 'unhealthy',
        health: healthDb
      };
    }
  } catch (e) {
    console.warn('⚠️  Could not read database health:', e.message);
  }

  try {
    if (fs.existsSync('out/ops/health-api.json')) {
      const healthApi = JSON.parse(fs.readFileSync('out/ops/health-api.json', 'utf-8'));
      dashboard.services.api = {
        status: healthApi.up ? 'healthy' : 'unhealthy',
        health: healthApi
      };
    }
  } catch (e) {
    console.warn('⚠️  Could not read API health:', e.message);
  }

  try {
    if (fs.existsSync('out/ops/health-worker.json')) {
      const healthWorker = JSON.parse(fs.readFileSync('out/ops/health-worker.json', 'utf-8'));
      dashboard.services.worker = {
        status: healthWorker.up ? 'healthy' : 'unhealthy',
        health: healthWorker
      };
    }
  } catch (e) {
    console.warn('⚠️  Could not read worker health:', e.message);
  }

  // Fallback checks for missing health files
  if (!dashboard.services.database.health) {
    dashboard.services.database.status = 'unknown';
  }
  if (!dashboard.services.api.health) {
    dashboard.services.api.status = await checkServiceHealth('api', 3000) ? 'healthy' : 'unknown';
  }
  if (!dashboard.services.worker.health) {
    dashboard.services.worker.status = 'unknown';
  }

  // Generate alerts based on conditions
  dashboard.alerts = generateAlerts(dashboard);

  // Maintenance mode detection (doctor file or env)
  try {
    const doctorPath = 'out/dev/schedules-doctor.json';
    let mode = 'cron';
    if (fs.existsSync(doctorPath)) {
      const doc = JSON.parse(fs.readFileSync(doctorPath, 'utf8'));
      mode = doc.mode || mode;
    } else if (process.env.MAINTENANCE_MODE) {
      mode = String(process.env.MAINTENANCE_MODE);
    }

    const maintenance = { mode };

    // If cron mode, add nextRun estimates for our known schedules
    if (mode === 'cron') {
      const crons = [
        { id: 'maintenance.normalizer.5m', cron: '*/5 * * * *' },
        { id: 'maintenance.ttl.hourly', cron: '0 * * * *' },
        { id: 'maintenance.archive.daily', cron: '10 3 * * *' },
      ];
      maintenance.nextRun = {};
      for (const c of crons) {
        try {
          maintenance.nextRun[c.id] = estimateNextRun(c.cron);
        } catch (err) {
          // ignore parse errors
        }
      }
    }

    // Back-compat alias: also expose under maintenance
    dashboard.schedules = maintenance;
    dashboard.maintenance = { ...dashboard.maintenance, nextRun: maintenance.nextRun, mode: maintenance.mode };
  } catch (e) {
    dashboard.schedules = { mode: 'cron' };
  }

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

// Estimate next run time for a cron string (minute-level) without deps
function estimateNextRun(cron) {
  // Supports patterns like "*/5 * * * *", "0 * * * *", "10 3 * * *"
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minSpec, hourSpec] = parts;
  const base = new Date();
  base.setSeconds(0, 0);

  function nextMinuteFromSpec(spec, base) {
    if (spec.startsWith('*/')) {
      const step = parseInt(spec.slice(2), 10) || 1;
      const m = base.getMinutes();
      const delta = (step - (m % step)) % step;
      const cand = new Date(base.getTime());
      cand.setMinutes(m + delta);
      if (delta === 0 && cand <= base) cand.setMinutes(cand.getMinutes() + step);
      return cand;
    }
    const val = parseInt(spec, 10);
    if (!isNaN(val)) {
      const cand = new Date(base.getTime());
      cand.setMinutes(val);
      if (cand <= base) cand.setHours(cand.getHours() + 1);
      return cand;
    }
    return null;
  }

  function nextHourFromSpec(spec, base) {
    if (spec === '*') return base;
    const val = parseInt(spec, 10);
    if (!isNaN(val)) {
      const cand = new Date(base.getTime());
      cand.setHours(val, cand.getMinutes(), 0, 0);
      if (cand <= base) cand.setDate(cand.getDate() + 1);
      return cand;
    }
    return base;
  }

  // compute next time honoring hour then minute
  const hourFirst = nextHourFromSpec(hourSpec, base);
  const minuteNext = nextMinuteFromSpec(minSpec, hourFirst);
  const result = minuteNext || hourFirst;
  return result ? result.toISOString() : null;
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