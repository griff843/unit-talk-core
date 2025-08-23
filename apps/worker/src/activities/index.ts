import { logger } from '@unit-talk/observability';

// Placeholder activities - no business logic yet
export const activities = {
  async ping(): Promise<string> {
    logger.info('Temporal activity: ping called');
    return 'pong';
  },

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    logger.info('Temporal activity: healthCheck called');
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  },
};
