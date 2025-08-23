/**
 * Temporal workflow for settlement operations
 * Orchestrates bet settlement and payout processing (READ ONLY in shadow mode)
 */

import { proxyActivities } from '@temporalio/workflow';

import type * as activities from '../activities/SettlementActivities.js';

// Configure activity timeouts and retry policies
const {
  processSettlementsActivity,
  calculatePayoutsActivity,
  updateUserBalancesActivity,
  healthCheckActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 minutes', // Settlement can take longer
  retry: {
    initialInterval: '5s',
    maximumInterval: '2m',
    maximumAttempts: 2, // Limited retries for financial operations
    backoffCoefficient: 2,
  },
});

/**
 * Settlement workflow configuration
 */
export interface SettlementWorkflowParams {
  settlementType?: 'pick' | 'contest' | 'parlay' | 'manual';
  contestId?: string;
  pickIds?: string[];
  shadowMode?: boolean;
  dryRun?: boolean;
  maxSettlementsPerBatch?: number;
}

/**
 * Settlement workflow result
 */
export interface SettlementWorkflowResult {
  success: boolean;
  settlementsProcessed: number;
  payoutsCalculated: number;
  balancesUpdated: number;
  totalPayoutAmount: number;
  error?: string;
  metadata: {
    settlementType: string;
    processingDuration: number;
    shadowMode: boolean;
    batchSize: number;
  };
}

/**
 * Main settlement workflow
 * Executes settlement processing with strict financial controls
 * CRITICAL: Only processes settlements, never writes to unified_picks
 */
export async function settlementWorkflow(
  params: SettlementWorkflowParams = {}
): Promise<SettlementWorkflowResult> {
  const startTime = Date.now();
  const settlementType = params.settlementType || 'pick';

  try {
    // Process settlements (reads from unified_picks, writes to settlements table)
    const settlementsResult = await processSettlementsActivity({
      settlementType,
      contestId: params.contestId,
      pickIds: params.pickIds,
      shadowMode: params.shadowMode || false,
      dryRun: params.dryRun || false,
      maxSettlementsPerBatch: params.maxSettlementsPerBatch || 100,
    });

    // Calculate payouts (read-only calculation)
    const payoutsResult = await calculatePayoutsActivity({
      settlements: settlementsResult.settlements,
      shadowMode: params.shadowMode || false,
      dryRun: params.dryRun || false,
    });

    let balancesResult = { updated: 0 };
    // Only update balances if not in shadow mode or dry run
    if (!params.shadowMode && !params.dryRun) {
      balancesResult = await updateUserBalancesActivity({
        payouts: payoutsResult.payouts,
        settlementType,
      });
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      settlementsProcessed: settlementsResult.processed,
      payoutsCalculated: payoutsResult.calculated,
      balancesUpdated: balancesResult.updated,
      totalPayoutAmount: payoutsResult.totalAmount,
      metadata: {
        settlementType,
        processingDuration: duration,
        shadowMode: params.shadowMode || false,
        batchSize: params.maxSettlementsPerBatch || 100,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      settlementsProcessed: 0,
      payoutsCalculated: 0,
      balancesUpdated: 0,
      totalPayoutAmount: 0,
      error: errorMessage,
      metadata: {
        settlementType,
        processingDuration: duration,
        shadowMode: params.shadowMode || false,
        batchSize: params.maxSettlementsPerBatch || 100,
      },
    };
  }
}

/**
 * Health check workflow for settlement system
 */
export async function settlementHealthCheckWorkflow(): Promise<{
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
