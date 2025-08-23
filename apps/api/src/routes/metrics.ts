import { Router } from 'express';
import { logger } from '@unit-talk/observability';

const router = Router();

// Hardened metrics ingestion endpoint
router.post('/ingestion', async (req, res) => {
  // Always return 200 status with success/failure in body
  const startTime = Date.now();

  try {
    // Set 2-second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 2000);
    });

    // Process metrics data with timeout
    const processPromise = processMetrics(req.body);

    await Promise.race([processPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    logger.info('Metrics ingestion successful', {
      duration,
      dataSize: JSON.stringify(req.body).length,
    });

    res.status(200).json({
      success: true,
      message: 'Metrics processed successfully',
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Metrics ingestion failed', {
      error: errorMessage,
      duration,
      dataSize: JSON.stringify(req.body).length,
    });

    // Always return 200 with success: false on error
    res.status(200).json({
      success: false,
      message: 'Failed to process metrics',
      error: errorMessage,
      duration,
    });
  }
});

async function processMetrics(data: any): Promise<void> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));

  // Validate basic structure
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid metrics data format');
  }

  // Add your metrics processing logic here
  logger.debug('Processing metrics', {
    keys: Object.keys(data),
    size: JSON.stringify(data).length,
  });
}

export { router as metricsRouter };
