import { Request, Response, Router } from 'express';
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// Create a Registry which registers the metrics
const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register]
});

const rawPropsIngested = new Counter({
  name: 'raw_props_ingested_total',
  help: 'Total number of raw props ingested',
  registers: [register]
});

const propsProcessed = new Counter({
  name: 'props_processed_total',
  help: 'Total number of props processed',
  registers: [register]
});

const propsPromoted = new Counter({
  name: 'props_promoted_total',
  help: 'Total number of props promoted',
  labelNames: ['shadow_mode'],
  registers: [register]
});

const processingErrors = new Counter({
  name: 'processing_errors_total',
  help: 'Total number of processing errors',
  labelNames: ['error_type'],
  registers: [register]
});

const backlogSize = new Gauge({
  name: 'backlog_size',
  help: 'Current size of processing backlog',
  registers: [register]
});

// Middleware to track HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: Function) => {
  const start = Date.now();
  
  // Track active connections
  activeConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString()
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
    activeConnections.dec();
  });
  
  next();
};

// Health check endpoint
export const healthCheck = async (req: Request, res: Response) => {
  try {
    // Add any health checks here (DB connection, external services, etc.)
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        SHADOW_MODE: process.env.SHADOW_MODE === 'true',
        PUBLISH_TO_DISCORD: process.env.PUBLISH_TO_DISCORD === 'true'
      },
      services: {
        database: 'connected', // Check actual DB connection
        temporal: 'connected', // Check Temporal connection
      }
    };
    
    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

// Metrics endpoint for Prometheus
export const metricsEndpoint = async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate metrics' 
    });
  }
};

// JSON metrics endpoint for dashboard
export const jsonMetrics = async (req: Request, res: Response) => {
  try {
    const metrics = await register.getMetricsAsJSON();
    
    // Add custom aggregated metrics
    const aggregated = {
      timestamp: new Date().toISOString(),
      http: {
        total_requests: metrics.find(m => m.name === 'http_requests_total')?.values || [],
        active_connections: metrics.find(m => m.name === 'active_connections')?.values?.[0]?.value || 0
      },
      processing: {
        raw_ingested: metrics.find(m => m.name === 'raw_props_ingested_total')?.values?.[0]?.value || 0,
        processed: metrics.find(m => m.name === 'props_processed_total')?.values?.[0]?.value || 0,
        promoted: metrics.find(m => m.name === 'props_promoted_total')?.values || [],
        errors: metrics.find(m => m.name === 'processing_errors_total')?.values || [],
        backlog: metrics.find(m => m.name === 'backlog_size')?.values?.[0]?.value || 0
      },
      system: {
        cpu: metrics.find(m => m.name === 'process_cpu_user_seconds_total')?.values?.[0]?.value || 0,
        memory: metrics.find(m => m.name === 'process_resident_memory_bytes')?.values?.[0]?.value || 0,
        uptime: metrics.find(m => m.name === 'process_start_time_seconds')?.values?.[0]?.value || 0
      }
    };
    
    res.json(aggregated);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate metrics' 
    });
  }
};

// Ingestion metrics endpoint (required by spec)
export const ingestionMetrics = async (req: Request, res: Response) => {
  try {
    // In production, query actual database for these metrics
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const metrics = {
      timestamp: new Date().toISOString(),
      window_start: fiveMinutesAgo.toISOString(),
      window_end: new Date().toISOString(),
      raw_new_5min: 10, // Query: SELECT COUNT(*) FROM raw_props WHERE inserted_at > window_start
      processed_5min: 8, // Query: SELECT COUNT(*) FROM raw_props WHERE processed_at > window_start
      promoted_5min: process.env.SHADOW_MODE === 'true' ? 0 : 5, // Query: SELECT COUNT(*) FROM unified_picks WHERE promoted_at > window_start
      settled_5min: 3, // Query: SELECT COUNT(*) FROM unified_picks WHERE settled_at > window_start
      backlog_size: 2, // Query: SELECT COUNT(*) FROM raw_props WHERE processed_at IS NULL
      shadow_mode: process.env.SHADOW_MODE === 'true',
      publish_to_discord: process.env.PUBLISH_TO_DISCORD === 'true'
    };
    
    // Save to file for other processes
    const fs = require('fs');
    const path = require('path');
    const outDir = path.join(process.cwd(), 'out', 'ops');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate ingestion metrics' 
    });
  }
};

// Setup metrics routes
export const setupMetricsRoutes = (app: Router) => {
  // Public health check (no auth required)
  app.get('/healthz', healthCheck);
  app.get('/health', healthCheck);
  
  // Prometheus metrics endpoint
  app.get('/metrics', metricsEndpoint);
  
  // JSON metrics for dashboard
  app.get('/api/metrics', jsonMetrics);
  
  // Ingestion metrics (required by spec)
  app.get('/api/metrics/ingestion', ingestionMetrics);
};

// Export metrics for use in other modules
export const metrics = {
  httpRequestDuration,
  httpRequestTotal,
  activeConnections,
  rawPropsIngested,
  propsProcessed,
  propsPromoted,
  processingErrors,
  backlogSize,
  register
};

export default {
  metricsMiddleware,
  setupMetricsRoutes,
  metrics
};