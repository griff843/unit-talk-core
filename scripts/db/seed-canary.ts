#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

/**
 * @fileoverview Canary Data Seeder for Shadow E2E Testing
 * @version 1.0.0
 * @author Unit Talk E2E Validation Team
 *
 * Seeds 6-12 deterministic canary rows into raw_props table
 * for shadow E2E pipeline validation.
 *
 * Features:
 * - Deterministic canary ID based on minute timestamp
 * - Multiple rows for comprehensive testing
 * - Safe for repeated execution (upsert behavior)
 * - Returns canary ID and count for tracking
 */

import { seedCanary, closeConnections } from '../shared/db';

interface CanaryResult {
  canaryId: string;
  count: number;
  timestamp: string;
  insertedIds: string[];
}

/**
 * Seed multiple canary rows for comprehensive E2E testing
 */
async function seedCanaryData(): Promise<CanaryResult> {
  const timestamp = new Date().toISOString();
  const baseCanaryId = `shadow-canary-${timestamp.slice(0, 16).replace(/[:-]/g, '')}`;

  // Generate 6-12 canary rows for comprehensive testing
  const canaryCount = Math.floor(Math.random() * 7) + 6; // 6-12 rows
  const insertedIds: string[] = [];

  console.log(
    `🌱 Seeding ${canaryCount} canary rows with base ID: ${baseCanaryId}`
  );

  try {
    for (let i = 0; i < canaryCount; i++) {
      const canaryId = `${baseCanaryId}-${i.toString().padStart(2, '0')}`;
      const insertedId = await seedCanary(canaryId);
      insertedIds.push(insertedId);
      console.log(`  ✅ Seeded canary: ${insertedId}`);
    }

    const result: CanaryResult = {
      canaryId: baseCanaryId,
      count: insertedIds.length,
      timestamp,
      insertedIds,
    };

    console.log(`🎯 Successfully seeded ${result.count} canary rows`);
    console.log(`📊 Canary batch ID: ${result.canaryId}`);
    console.log(`⏰ Timestamp: ${result.timestamp}`);

    // Output JSON for programmatic use
    console.log('\n📄 JSON Result:');
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to seed canary data: ${errorMessage}`);

    const failureResult: CanaryResult = {
      canaryId: baseCanaryId,
      count: insertedIds.length,
      timestamp,
      insertedIds,
    };

    console.log('\n📄 Partial Result (on failure):');
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
    console.log('🚀 Starting canary data seeding for shadow E2E validation');

    const result = await seedCanaryData();

    console.log('\n✅ Canary seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error(
      '\n💥 Canary seeding failed:',
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

export { seedCanaryData, type CanaryResult };
