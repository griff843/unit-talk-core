/**
 * Temporal activities for alert operations
 * Handles alert processing, notification delivery, and subscription management
 */

import { logger } from '@unit-talk/observability';

import type { AlertAdapterConfig } from '../adapters/alertAdapter.js';
import {
  processAlertQueue,
  sendNotifications,
  manageAlertSubscriptions,
  testAlertAdapter,
} from '../adapters/alertAdapter.js';

/**
 * Process alerts activity
 */
export async function processAlertsActivity(
  config: AlertAdapterConfig & {
    maxAlertsPerMinute: number;
  }
): Promise<{ processed: number; alerts: any[] }> {
  logger.info('Starting alerts processing activity', { config });

  try {
    const result = await processAlertQueue(config);

    logger.info('Alerts processing activity completed', {
      success: result.success,
      processed: result.processed,
    });

    return {
      processed: result.processed,
      alerts: result.alerts || [],
    };
  } catch (error) {
    logger.error('Alerts processing activity failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Send notification activity
 */
export async function sendNotificationActivity(config: {
  alerts: any[];
  channels: string[];
  priority: string;
  shadowMode: boolean;
}): Promise<{ sent: number }> {
  try {
    logger.info('Sending notifications', {
      alertCount: config.alerts.length,
      channels: config.channels,
      shadowMode: config.shadowMode,
    });

    const result = await sendNotifications(config);

    logger.info('Notifications sent', {
      sent: result.sent,
    });

    return result;
  } catch (error) {
    logger.error('Failed to send notifications', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Manage alert subscriptions activity
 */
export async function manageSubscriptionsActivity(config: {
  alertType: string;
  shadowMode: boolean;
}): Promise<{ managed: number }> {
  try {
    logger.debug('Managing alert subscriptions', { config });

    const result = await manageAlertSubscriptions(config);

    logger.debug('Alert subscriptions managed', {
      managed: result.managed,
    });

    return result;
  } catch (error) {
    logger.error('Failed to manage alert subscriptions', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Health check activity for alert system
 */
export async function healthCheckActivity(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    logger.debug('Starting alert system health check');

    // Test adapter connection
    const connectionTest = await testAlertAdapter();

    // Test notification channels
    const channelTests = {
      discord: true, // Mock for now
      email: true,
      sms: true,
      notion: true,
    };

    const healthy =
      connectionTest && Object.values(channelTests).every(Boolean);

    const result = {
      healthy,
      timestamp: new Date().toISOString(),
      details: {
        connection: connectionTest,
        channels: channelTests,
        adapter: 'operational',
      },
    };

    logger.info('Alert system health check completed', {
      healthy: result.healthy,
      details: result.details,
    });

    return result;
  } catch (error) {
    logger.error('Alert system health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
