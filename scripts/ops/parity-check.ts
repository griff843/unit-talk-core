#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

/**
 * @fileoverview Ops Parity Check for Unit Talk Core
 * @version 1.0.0
 * @author Unit Talk Ops Team
 *
 * Validates data parity constraints across the pipeline:
 * - raw_new_5min ≥ processed_5min ≥ promoted_5min
 * - No empty error strings; include phase in all error messages
 * - Machine-readable JSON output for ops dashboard
 */

import {
  countRawProps,
  countProcessed,
  countPromoted,
  closeConnections,
} from '../shared/db';

export interface ParityResult {
  ok: boolean;
  details?: unknown;
  timestamp?: string;
  error?: string;
}

interface ParityDetails {
  window_minutes: number;
  raw_count: number;
  processed_count: number;
  promoted_count: number;
  parity_constraints: {
    raw_ge_processed: boolean;
    processed_ge_promoted: boolean;
    overall_valid: boolean;
  };
  validation_timestamp: string;
  phase: string;
}

export async function runParityCheck(
  windowMinutes: number = 5
): Promise<ParityResult> {
  const phase = `parity_check_${windowMinutes}min`;
  const timestamp = new Date().toISOString();

  try {
    console.log(`🔍 Running parity check (${windowMinutes}-minute window)`);

    // Get counts using shared DB helpers with fallback strategies
    const rawCount = await countRawProps(windowMinutes);
    const processedCount = await countProcessed(windowMinutes);
    const promotedCount = await countPromoted(windowMinutes);

    // Validate parity constraints
    const rawGeProcessed = rawCount >= processedCount;
    const processedGePromoted = processedCount >= promotedCount;
    const overallValid = rawGeProcessed && processedGePromoted;

    const details: ParityDetails = {
      window_minutes: windowMinutes,
      raw_count: rawCount,
      processed_count: processedCount,
      promoted_count: promotedCount,
      parity_constraints: {
        raw_ge_processed: rawGeProcessed,
        processed_ge_promoted: processedGePromoted,
        overall_valid: overallValid,
      },
      validation_timestamp: timestamp,
      phase,
    };

    const result: ParityResult = {
      ok: overallValid,
      details,
      timestamp,
    };

    if (overallValid) {
      console.log('✅ Parity check passed', {
        raw: rawCount,
        processed: processedCount,
        promoted: promotedCount,
        phase,
      });
    } else {
      console.log('❌ Parity check failed', {
        raw: rawCount,
        processed: processedCount,
        promoted: promotedCount,
        violations: {
          raw_ge_processed: !rawGeProcessed,
          processed_ge_promoted: !processedGePromoted,
        },
        phase,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullErrorMessage = `${phase}: ${errorMessage}`;

    console.error('💥 Parity check failed with error', {
      error: fullErrorMessage,
      phase,
      timestamp,
    });

    return {
      ok: false,
      error: fullErrorMessage,
      timestamp,
      details: {
        phase,
        error_occurred: true,
        error_message: fullErrorMessage,
        validation_timestamp: timestamp,
      },
    };
  }
}

if (require.main === module) {
  runParityCheck()
    .then(res => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.ok ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Parity check execution failed:', error);
      console.log(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        })
      );
      process.exit(1);
    })
    .finally(async () => {
      try {
        await closeConnections();
      } catch (error) {
        console.warn('Warning: Failed to close database connections');
      }
    });
}
