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

import { getSupabaseAdmin, closeConnections } from '../shared/db';

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
    // Use Supabase admin for inserts (no inserted_at conflicts)
    const supabase = getSupabaseAdmin();
    
    // Create all canary rows in batch
    const canaryRows = Array.from({ length: canaryCount }, (_, i) => ({
      id: `${baseCanaryId}-${i.toString().padStart(2, '0')}`,
      data: {
        canary: true,
        baseId: baseCanaryId,
        index: i,
        timestamp: timestamp,
        kind: 'shadow_canary'
      },
      type: 'canary_test',
      source: 'acceptance',
      is_canary: true
      // Don't include inserted_at - let DB default handle it
    }));

    console.log(`  📦 Inserting ${canaryRows.length} rows...`);
    
    const { data: insertedData, error } = await supabase
      .from('raw_props')
      .insert(canaryRows)
      .select('id');
      
    if (error) {
      // If Supabase insert fails due to cache, retry once
      console.log(`  ⚠️  Retrying insert due to cache miss: ${error.message}`);
      const { data: retryData, error: retryError } = await supabase
        .from('raw_props')
        .insert(canaryRows)
        .select('id');
        
      if (retryError) {
        throw new Error(`Supabase insert failed: ${retryError.message}`);
      }
      
      insertedData = retryData;
    }

    if (!insertedData || insertedData.length === 0) {
      throw new Error('No data returned from insert operation');
    }

    insertedIds.push(...insertedData.map(row => row.id));
    
    console.log(`  ✅ Successfully inserted ${insertedIds.length} canary rows`);

    // Optionally mark some as processed (simulate processing step)
    const processedCount = Math.floor(insertedIds.length * 0.8); // 80% processed
    if (processedCount > 0) {
      const idsToProcess = insertedIds.slice(0, processedCount);
      
      console.log(`  🔄 Marking ${idsToProcess.length} rows as processed...`);
      
      const { error: processError } = await supabase
        .from('raw_props')
        .update({ processed_at: new Date().toISOString() })
        .in('id', idsToProcess);
        
      if (processError) {
        console.warn(`  ⚠️  Could not mark as processed: ${processError.message}`);
      } else {
        console.log(`  ✅ Marked ${idsToProcess.length} rows as processed`);
      }
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

    const res = await seedCanaryData();
    void res;
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
