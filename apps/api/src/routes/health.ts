import { Router } from 'express';
import { logger } from '@unit-talk/observability';

const router = Router();

router.get('/', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  logger.debug('Health check requested', { health });

  res.status(200).json(health);
});

export { router as healthRouter };
