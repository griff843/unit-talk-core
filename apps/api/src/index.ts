import { config } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';
import express from 'express';
import rateLimit from 'express-rate-limit';

import { healthRouter } from './routes/health.js';
import { metricsRouter } from './routes/metrics.js';

const app = express();

// Trust proxy to handle X-Forwarded-For correctly
app.set('trust proxy', 1);

// Basic middleware
app.use(express.json({ limit: '10mb' }));

// Health endpoint (no rate limiting)
app.use('/api/health', healthRouter);

// Metrics endpoint with strict rate limiting
const metricsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  keyGenerator: req => {
    // Use leftmost IP from X-Forwarded-For header
    const forwarded = req.get('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/metrics', metricsLimiter, metricsRouter);

// Default 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
);

const port = config.api.port;

app.listen(port, () => {
  logger.info(`API server listening on port ${port}`, { port });
});

export { app };
