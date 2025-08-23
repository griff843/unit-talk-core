#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

/**
 * @fileoverview Canary Data Cleanup for Shadow E2E Testing
 * @version 1.0.0
 * @author Unit Talk E2E Validation Team
 *
 * Cleans up canary test data from both raw_props and unified_picks tables.
 * Only runs when CLEANUP_AFTER=true to preserve evidence by default.
 *
 * Features:
 * - Respects CLEANUP_AFTER environment variable
 * - Cleans from both raw_props and derived unified_picks
 * - Provides detailed cleanup statistics
 * - Safe for repeated execution
 */

import { cleanupCanary, closeConnections } from '../shared/db';

interface CleanupResult {
  canaryId: string;
  cleanupExecuted: boolean;
  rawDeleted: number;
  unifiedDeleted: number;
  totalDeleted: number;
  timestamp: string;
  reason?: string;
}

/**
 * Execute canary data cleanup with environment variable check
 */
async function executeCanaryCleanup(canaryId?: string): Promise<CleanupResult> {
  const timestamp = new Date().toISOString();
  const shouldCleanup = process.env.CLEANUP_AFTER === 'true';

  // Default canary ID if not provided - matches seeding pattern
  const targetCanaryId =
    canaryId || `shadow-canary-${timestamp.slice(0, 16).replace(/[:-]/g, '')}`;

  console.log(`🧹 Canary cleanup requested for ID: ${targetCanaryId}`);
  console.log(
    `🔧 CLEANUP_AFTER environment variable: ${process.env.CLEANUP_AFTER}`
  );

  if (!shouldCleanup) {
    const result: CleanupResult = {
      canaryId: targetCanaryId,
      cleanupExecuted: false,
      rawDeleted: 0,
      unifiedDeleted: 0,
      totalDeleted: 0,
      timestamp,
      reason: 'CLEANUP_AFTER is not set to "true" - preserving evidence',
    };

    console.log('⏭️  Skipping cleanup to preserve test evidence');
    console.log('💡 Set CLEANUP_AFTER=true to enable cleanup');

    console.log('\n📄 JSON Result:');
    console.log(JSON.stringify(result, null, 2));

    return result;
  }

  try {
    console.log('🗑️  Executing canary data cleanup...');

    // Execute cleanup for all canary rows matching the base pattern
    let totalRawDeleted = 0;
    let totalUnifiedDeleted = 0;

    // Clean up batch of canary rows (handles pattern like shadow-canary-TIMESTAMP-NN)
    const batchPattern = targetCanaryId.includes('-00')
      ? targetCanaryId.replace('-00', '') // Remove batch suffix to get base pattern
      : targetCanaryId;

    // For simplicity, try to clean specific IDs in batch
    for (let i = 0; i < 20; i++) {
      // Maximum expected canary count
      const batchCanaryId = `${batchPattern}-${i.toString().padStart(2, '0')}`;

      try {
        const { rawDeleted, unifiedDeleted } =
          await cleanupCanary(batchCanaryId);

        if (rawDeleted > 0 || unifiedDeleted > 0) {
          totalRawDeleted += rawDeleted;
          totalUnifiedDeleted += unifiedDeleted;
          console.log(
            `  ✅ Cleaned canary ${batchCanaryId}: raw=${rawDeleted}, unified=${unifiedDeleted}`
          );
        }
      } catch (error) {
        // Ignore individual cleanup failures (row may not exist)
        if (i === 0) {
          // If even the first one fails, try the exact canary ID provided
          try {
            const { rawDeleted, unifiedDeleted } =
              await cleanupCanary(targetCanaryId);
            totalRawDeleted += rawDeleted;
            totalUnifiedDeleted += unifiedDeleted;
            console.log(
              `  ✅ Cleaned exact canary ${targetCanaryId}: raw=${rawDeleted}, unified=${unifiedDeleted}`
            );
          } catch (exactError) {
            console.log(
              `  ⚠️  No canary data found for pattern: ${targetCanaryId}`
            );
          }
        }
      }
    }

    const result: CleanupResult = {
      canaryId: targetCanaryId,
      cleanupExecuted: true,
      rawDeleted: totalRawDeleted,
      unifiedDeleted: totalUnifiedDeleted,
      totalDeleted: totalRawDeleted + totalUnifiedDeleted,
      timestamp,
    };

    console.log(`🎯 Cleanup completed successfully`);
    console.log(`📊 Raw props deleted: ${result.rawDeleted}`);
    console.log(`📊 Unified picks deleted: ${result.unifiedDeleted}`);
    console.log(`📊 Total rows deleted: ${result.totalDeleted}`);
    console.log(`⏰ Cleanup timestamp: ${result.timestamp}`);

    // Output JSON for programmatic use
    console.log('\n📄 JSON Result:');
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to cleanup canary data: ${errorMessage}`);

    const failureResult: CleanupResult = {
      canaryId: targetCanaryId,
      cleanupExecuted: false,
      rawDeleted: 0,
      unifiedDeleted: 0,
      totalDeleted: 0,
      timestamp,
      reason: `Cleanup failed: ${errorMessage}`,
    };

    console.log('\n📄 Failure Result:');
    console.log(
      JSON.stringify(
        {
          ...failureResult,
          error: errorMessage,
          success: false,
        },
        null,
        2
      )
    );

    throw error;
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting canary data cleanup for shadow E2E validation');

    // Allow canary ID to be passed as command line argument
    const canaryId = process.argv[2];

    if (canaryId) {
      console.log(`🎯 Target canary ID from argument: ${canaryId}`);
    }

    const result = await executeCanaryCleanup(canaryId);

    if (result.cleanupExecuted && result.totalDeleted === 0) {
      console.log('\n⚠️  No canary data found to clean up');
    } else if (result.cleanupExecuted) {
      console.log('\n✅ Canary cleanup completed successfully');
    } else {
      console.log('\n⏭️  Canary cleanup skipped (preserving evidence)');
    }

    process.exit(0);
  } catch (error) {
    console.error(
      '\n💥 Canary cleanup failed:',
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

export { executeCanaryCleanup, type CleanupResult };
