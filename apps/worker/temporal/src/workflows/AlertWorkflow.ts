/**
 * Temporal workflow for alert operations
 * Orchestrates notification delivery and alert management with shadow mode support
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/AlertActivities.js';

// Configure activity timeouts and retry policies
const {
  processAlertsActivity,
  sendNotificationActivity,
  manageSubscriptionsActivity,
  healthCheckActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes', // Max time for alert operations
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    maximumAttempts: 5, // More retries for notifications
    backoffCoefficient: 2,
  },
});

/**
 * Alert workflow configuration
 */
export interface AlertWorkflowParams {
  alertType?:
    | 'pick_promotion'
    | 'settlement'
    | 'contest'
    | 'system'
    | 'marketing';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  channels?: ('discord' | 'email' | 'sms' | 'notion')[];
  shadowMode?: boolean;
  dryRun?: boolean;
  maxAlertsPerMinute?: number;
}

/**
 * Alert workflow result
 */
export interface AlertWorkflowResult {
  success: boolean;
  alertsProcessed: number;
  notificationsSent: number;
  subscriptionsManaged: number;
  error?: string;
  metadata: {
    alertType: string;
    priority: string;
    channels: string[];
    processingDuration: number;
    shadowMode: boolean;
  };
}

/**
 * Main alert workflow
 * Executes alert processing and notification delivery
 */
export async function alertWorkflow(
  params: AlertWorkflowParams = {}
): Promise<AlertWorkflowResult> {
  const startTime = Date.now();
  const alertType = params.alertType || 'system';
  const priority = params.priority || 'medium';
  const channels = params.channels || ['discord'];

  try {
    // Process alerts
    const alertsResult = await processAlertsActivity({
      alertType,
      priority,
      shadowMode: params.shadowMode || false,
      dryRun: params.dryRun || false,
      maxAlertsPerMinute: params.maxAlertsPerMinute || 60,
    });

    let notificationsResult = { sent: 0 };
    // Only send notifications if not in dry run and shadow mode allows
    if (
      !params.dryRun &&
      (!params.shadowMode || process.env.ALLOW_SHADOW_NOTIFICATIONS === 'true')
    ) {
      notificationsResult = await sendNotificationActivity({
        alerts: alertsResult.alerts,
        channels,
        priority,
        shadowMode: params.shadowMode || false,
      });
    }

    // Manage subscriptions (safe operation)
    const subscriptionsResult = await manageSubscriptionsActivity({
      alertType,
      shadowMode: params.shadowMode || false,
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      alertsProcessed: alertsResult.processed,
      notificationsSent: notificationsResult.sent,
      subscriptionsManaged: subscriptionsResult.managed,
      metadata: {
        alertType,
        priority,
        channels,
        processingDuration: duration,
        shadowMode: params.shadowMode || false,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      alertsProcessed: 0,
      notificationsSent: 0,
      subscriptionsManaged: 0,
      error: errorMessage,
      metadata: {
        alertType,
        priority,
        channels,
        processingDuration: duration,
        shadowMode: params.shadowMode || false,
      },
    };
  }
}

/**
 * Health check workflow for alert system
 */
export async function alertHealthCheckWorkflow(): Promise<{
  healthy: boolean;
  timestamp: string;
  details: Record<string, any>;
}> {
  try {
    return await healthCheckActivity();
  } catch (error) {
    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
