import { Worker } from '@temporalio/worker';
import { config } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';
import { activities } from './activities/index.js';

async function main() {
  try {
    const worker = await Worker.create({
      workflowsPath: require.resolve('./workflows/index.js'),
      activities,
      taskQueue: config.temporal.taskQueue,
      connection: {
        type: 'local',
        address: config.temporal.serverAddress,
      } as any,
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

main().catch(error => {
  logger.error('Worker crashed', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
