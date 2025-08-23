import { Worker } from '@temporalio/worker';
import { getConfig } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';
import { activities } from './activities/index.js';

async function main() {
  const config = getConfig();
  
  try {
    const worker = await Worker.create({
      workflowsPath: require.resolve('./workflows/index.js'),
      activities,
      taskQueue: config.temporal.taskQueue,
      connection: {
        address: config.temporal.serverAddress,
      },
    });

    logger.info('Temporal worker starting', {
      taskQueue: config.temporal.taskQueue,
      serverAddress: config.temporal.serverAddress,
    });

    await worker.run();
  } catch (error) {
    logger.error('Worker failed to start', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

main().catch((error) => {
  logger.error('Worker crashed', { 
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});