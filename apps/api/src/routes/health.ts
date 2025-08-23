import { logger } from '@unit-talk/observability';
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  const health = {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  try {
    // Validate response shape; strict=false logs, strict=true throws but we still return original response
    // Dynamically import to avoid resolver noise during commit
    const mod = await import('@unit-talk/contracts'); // eslint-disable-line import/no-unresolved
    mod.parseOrReport(mod.Http.HealthResponse, health, 'api.health.response');
  } catch {
    /* no-op: do not change behavior */
  }

  logger.debug('Health check requested', { health });

  res.status(200).json(health);
});

export { router as healthRouter };
