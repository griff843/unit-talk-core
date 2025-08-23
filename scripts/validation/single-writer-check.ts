#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

/**
 * @fileoverview Single-Writer Contract Validation for Unit Talk Core
 * @version 1.0.0
 * @author Unit Talk E2E Validation Team
 *
 * Validates that only the Promoter workflow writes to unified_picks table.
 * This is a critical architectural constraint for data integrity.
 *
 * Validation methods:
 * 1. Code analysis - Only executePromoterWrite() can write to unified_picks
 * 2. Runtime verification - All writes must come from promoter workflow
 * 3. Audit trail - Track write sources in payload metadata
 */

import { getPgPool, getSupabaseAdmin, closeConnections } from '../shared/db';

interface SingleWriterValidation {
  valid: boolean;
  violations: string[];
  evidence: {
    total_writes_checked: number;
    promoter_writes: number;
    unauthorized_writes: number;
    validation_method: string;
    validation_timestamp: string;
    sample_payloads: any[];
  };
  error?: string;
}

/**
 * Validate single-writer constraint by examining write patterns
 * In this implementation, we check the payload metadata for write source
 */
export async function validateSingleWriterConstraint(
  windowMinutes: number = 60
): Promise<SingleWriterValidation> {
  const validationTimestamp = new Date().toISOString();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  try {
    console.log(
      `🔍 Validating single-writer constraint (${windowMinutes}-minute window)`
    );

    let totalWrites = 0;
    let promoterWrites = 0;
    let unauthorizedWrites = 0;
    const samplePayloads: any[] = [];
    const violations: string[] = [];

    try {
      // Try pg.Pool first (preferred for complex queries)
      const pool = getPgPool();
      const query = `
        SELECT id, promoted_at, payload
        FROM public.unified_picks 
        WHERE promoted_at >= $1
        ORDER BY promoted_at DESC
        LIMIT 100
      `;

      const result = await pool.query(query, [windowStart.toISOString()]);
      totalWrites = result.rowCount || 0;

      // Analyze each write's payload to identify source
      for (const row of result.rows) {
        const payload = row.payload;
        samplePayloads.push({
          id: row.id,
          promoted_at: row.promoted_at,
          payload: payload,
        });

        // Check if write came from promoter workflow
        if (
          payload?.source === 'promoter_workflow' ||
          payload?.promoted_by?.includes('promoter') ||
          payload?.write_source === 'executePromoterWrite'
        ) {
          promoterWrites++;
        } else {
          unauthorizedWrites++;
          violations.push(
            `Unauthorized write detected: ID ${row.id} at ${row.promoted_at}`
          );
        }
      }
    } catch (pgError) {
      try {
        // Fallback to Supabase service client
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('unified_picks')
          .select('id, promoted_at, payload')
          .gte('promoted_at', windowStart.toISOString())
          .order('promoted_at', { ascending: false })
          .limit(100);

        if (error) {
          throw new Error(`Supabase query failed: ${error.message}`);
        }

        totalWrites = data?.length || 0;

        // Analyze each write's payload to identify source
        for (const row of data || []) {
          const payload = row.payload;
          samplePayloads.push({
            id: row.id,
            promoted_at: row.promoted_at,
            payload: payload,
          });

          // Check if write came from promoter workflow
          if (
            payload?.source === 'promoter_workflow' ||
            payload?.promoted_by?.includes('promoter') ||
            payload?.write_source === 'executePromoterWrite'
          ) {
            promoterWrites++;
          } else {
            unauthorizedWrites++;
            violations.push(
              `Unauthorized write detected: ID ${row.id} at ${row.promoted_at}`
            );
          }
        }
      } catch (supabaseError) {
        const pgErrorMsg =
          pgError instanceof Error ? pgError.message : String(pgError);
        const supabaseErrorMsg =
          supabaseError instanceof Error
            ? supabaseError.message
            : String(supabaseError);
        throw new Error(
          `Failed to validate single-writer constraint. pg: ${pgErrorMsg}. supabase: ${supabaseErrorMsg}`
        );
      }
    }

    // Contract validation
    const contractValid = unauthorizedWrites === 0;

    const result: SingleWriterValidation = {
      valid: contractValid,
      violations,
      evidence: {
        total_writes_checked: totalWrites,
        promoter_writes: promoterWrites,
        unauthorized_writes: unauthorizedWrites,
        validation_method: 'payload_source_analysis',
        validation_timestamp: validationTimestamp,
        sample_payloads: samplePayloads.slice(0, 5), // Keep samples small
      },
    };

    if (contractValid) {
      console.log('✅ Single-writer contract validated', {
        total_writes: totalWrites,
        promoter_writes: promoterWrites,
        unauthorized_writes: unauthorizedWrites,
        window_minutes: windowMinutes,
      });
    } else {
      console.log('❌ Single-writer contract violated', {
        total_writes: totalWrites,
        promoter_writes: promoterWrites,
        unauthorized_writes: unauthorizedWrites,
        violations: violations.length,
        window_minutes: windowMinutes,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('💥 Single-writer validation failed', {
      error: errorMessage,
      window_minutes: windowMinutes,
      validation_timestamp: validationTimestamp,
    });

    return {
      valid: false,
      violations: [`Validation error: ${errorMessage}`],
      evidence: {
        total_writes_checked: 0,
        promoter_writes: 0,
        unauthorized_writes: 0,
        validation_method: 'validation_failed',
        validation_timestamp: validationTimestamp,
        sample_payloads: [],
      },
      error: errorMessage,
    };
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting single-writer contract validation');

    // Allow window minutes to be passed as command line argument
    const windowMinutes = process.argv[2] ? parseInt(process.argv[2], 10) : 60;

    console.log(`🔧 Validation window: ${windowMinutes} minutes`);

    const result = await validateSingleWriterConstraint(windowMinutes);

    // Output JSON for programmatic use
    console.log('\n📄 Validation Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.valid) {
      console.log('\n✅ Single-writer contract validation PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ Single-writer contract validation FAILED');
      console.log(`Violations: ${result.violations.length}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(
      '\n💥 Single-writer validation execution failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    await closeConnections();
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export type { SingleWriterValidation };
