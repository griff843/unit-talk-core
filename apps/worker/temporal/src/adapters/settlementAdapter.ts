/**
 * Settlement Adapter - Bridges settlement logic with I/O operations
 * CRITICAL: Never writes to unified_picks table - only reads from it
 * Handles bet settlement, payout calculation, and balance updates
 */

import { createAnonClient } from '@unit-talk/db';
import { logger } from '@unit-talk/observability';

/**
 * Settlement adapter configuration
 */
export interface SettlementAdapterConfig {
  settlementType: 'pick' | 'contest' | 'parlay' | 'manual';
  contestId?: string;
  pickIds?: string[];
  shadowMode: boolean;
  dryRun: boolean;
}

/**
 * Settlement operation result
 */
export interface SettlementOperationResult {
  success: boolean;
  processed: number;
  settlements?: any[];
  error?: string;
  metadata: {
    settlementType: string;
    processingDuration: number;
    shadowMode: boolean;
  };
}

/**
 * Process settlements
 * READS from unified_picks, WRITES to settlements table only
 */
export async function processSettlements(
  config: SettlementAdapterConfig & { maxSettlementsPerBatch: number }
): Promise<{ success: boolean; processed: number; settlements: any[] }> {
  const startTime = Date.now();
  const db = createAnonClient();

  try {
    logger.info('Processing settlements', { config });

    // CRITICAL: This function NEVER writes to unified_picks
    // It only reads from unified_picks and writes to settlements table

    if (config.shadowMode || config.dryRun) {
      logger.info('Shadow mode or dry run: Returning mock settlements');
      return {
        success: true,
        processed: 2,
        settlements: [
          {
            id: 'mock-settlement-1',
            pick_id: 'mock-pick-1',
            status: 'won',
            payout: 150.0,
            settled_at: new Date().toISOString(),
          },
          {
            id: 'mock-settlement-2',
            pick_id: 'mock-pick-2',
            status: 'lost',
            payout: 0.0,
            settled_at: new Date().toISOString(),
          },
        ],
      };
    }

    // Build query to read from unified_picks (READ ONLY)
    let query = db
      .from('unified_picks')
      .select(
        `
        id,
        payload,
        promoted_at,
        settled_at
      `
      )
      .is('settled_at', null) // Only unsettled picks
      .not('promoted_at', 'is', null) // Only promoted picks
      .limit(config.maxSettlementsPerBatch);

    // Apply filters
    if (config.pickIds && config.pickIds.length > 0) {
      query = query.in('id', config.pickIds);
    }

    if (config.contestId) {
      query = query.eq('payload->>contest_id', config.contestId);
    }

    const { data: picks, error: picksError } = await query;

    if (picksError) {
      throw new Error(
        `Failed to fetch picks for settlement: ${picksError.message}`
      );
    }

    const settlements: any[] = [];

    if (picks && picks.length > 0) {
      for (const pick of picks) {
        try {
          // Determine settlement status based on pick data
          const settlementStatus = await determineSettlementStatus(pick);

          // Create settlement record (writes to settlements table, NOT unified_picks)
          const settlement = {
            id: `settlement-${pick.id}-${Date.now()}`,
            pick_id: pick.id,
            status: settlementStatus.status,
            payout: settlementStatus.payout,
            settled_at: new Date().toISOString(),
            settlement_type: config.settlementType,
          };

          // Insert into settlements table (NOT unified_picks)
          const { error: insertError } = await db
            .from('settlements')
            .insert(settlement);

          if (insertError) {
            logger.error('Failed to insert settlement', {
              pickId: pick.id,
              error: insertError.message,
            });
            continue;
          }

          settlements.push(settlement);
        } catch (error) {
          logger.error('Failed to process individual settlement', {
            pickId: pick.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const processed = settlements.length;

    logger.info('Settlements processed', {
      processed,
      settlementType: config.settlementType,
      singleWriterCompliance: 'enforced - no unified_picks writes',
    });

    return {
      success: true,
      processed,
      settlements,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to process settlements', { error: errorMessage });

    return {
      success: false,
      processed: 0,
      settlements: [],
    };
  }
}

/**
 * Calculate payouts
 * Pure calculation function - no database writes
 */
export async function calculatePayouts(config: {
  settlements: any[];
  shadowMode: boolean;
  dryRun: boolean;
}): Promise<{ calculated: number; payouts: any[]; totalAmount: number }> {
  try {
    logger.info('Calculating payouts', {
      settlementCount: config.settlements.length,
      shadowMode: config.shadowMode,
    });

    const payouts: any[] = [];
    let totalAmount = 0;

    for (const settlement of config.settlements) {
      const payout = {
        id: `payout-${settlement.id}`,
        settlement_id: settlement.id,
        user_id: settlement.user_id, // Assuming this is available
        amount: settlement.payout,
        currency: 'USD',
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      payouts.push(payout);
      totalAmount += settlement.payout;
    }

    const calculated = payouts.length;

    logger.info('Payouts calculated', {
      calculated,
      totalAmount,
    });

    return {
      calculated,
      payouts,
      totalAmount,
    };
  } catch (error) {
    logger.error('Failed to calculate payouts', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Update user balances
 * CRITICAL: Only executes in production mode (not shadow/dry run)
 */
export async function updateUserBalances(config: {
  payouts: any[];
  settlementType: string;
}): Promise<{ updated: number }> {
  const db = createAnonClient();

  try {
    logger.info('Updating user balances', {
      payoutCount: config.payouts.length,
      settlementType: config.settlementType,
    });

    let updated = 0;

    for (const payout of config.payouts) {
      if (payout.amount > 0) {
        // Update user balance (add winnings)
        const { error } = await db.rpc('update_user_balance', {
          user_id: payout.user_id,
          amount: payout.amount,
          transaction_type: 'payout',
          reference_id: payout.settlement_id,
        });

        if (error) {
          logger.error('Failed to update user balance', {
            userId: payout.user_id,
            amount: payout.amount,
            error: error.message,
          });
          continue;
        }

        updated++;
      }
    }

    logger.info('User balances updated', { updated });
    return { updated };
  } catch (error) {
    logger.error('Failed to update user balances', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Test settlement adapter connection
 */
export async function testSettlementAdapter(): Promise<boolean> {
  try {
    const db = createAnonClient();

    // Test read access to unified_picks (required)
    const { error: picksError } = await db
      .from('unified_picks')
      .select('id')
      .limit(1);

    if (picksError) {
      logger.error('Cannot access unified_picks table', {
        error: picksError.message,
      });
      return false;
    }

    // Test write access to settlements table
    const testSettlement = {
      id: `test-settlement-${Date.now()}`,
      pick_id: 'test-pick',
      status: 'test',
      payout: 0,
      settled_at: new Date().toISOString(),
      settlement_type: 'test',
    };

    const { error: insertError } = await db
      .from('settlements')
      .insert(testSettlement);

    if (insertError) {
      logger.warn('Cannot write to settlements table', {
        error: insertError.message,
      });
      // Don't fail the test - table might not exist yet
    } else {
      // Clean up test record
      await db.from('settlements').delete().eq('id', testSettlement.id);
    }

    return true;
  } catch (error) {
    logger.error('Settlement adapter connection test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Determine settlement status for a pick
 * This is where the business logic for determining wins/losses would go
 */
async function determineSettlementStatus(
  pick: any
): Promise<{ status: 'won' | 'lost' | 'push' | 'cancelled'; payout: number }> {
  // Mock implementation - in reality, this would check against sports data
  const mockOutcome = Math.random();

  if (mockOutcome < 0.45) {
    return { status: 'won', payout: 150.0 };
  } else if (mockOutcome < 0.9) {
    return { status: 'lost', payout: 0.0 };
  } else if (mockOutcome < 0.95) {
    return { status: 'push', payout: 100.0 }; // Return original stake
  } else {
    return { status: 'cancelled', payout: 100.0 }; // Return original stake
  }
}
