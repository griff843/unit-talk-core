#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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
 * - Writes sidecar file with processed count tracking
 */

import { getPgPoolDirect, getSupabaseAdmin, closeConnections } from '../shared/db';

interface CanaryResult {
  canaryId: string;
  insertedCount: number;
  processedCount: number;
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

  // Initialize tracking variables
  let processedCount = 0;
  
  try {
    // Try direct PostgreSQL connection first, fallback to Supabase
    let usePg = true;
    let client: any = null;
    let supabase: any = null;
    
    try {
      const pool = getPgPoolDirect();
      client = await pool.connect();
      console.log('  ✅ Using direct PostgreSQL connection');
    } catch (pgError) {
      console.log(`  ⚠️ Direct pg failed: ${pgError instanceof Error ? pgError.message : pgError}`);
      console.log('  🔄 Falling back to Supabase client...');
      usePg = false;
      supabase = getSupabaseAdmin();
      console.log('  ✅ Using Supabase service client');
    }
    
    try {
      if (usePg) {
        // Create all canary rows and insert them using direct pg
        console.log(`  📦 Inserting ${canaryCount} rows using direct pg connection...`);
        
        const insertQuery = `
          INSERT INTO public.raw_props (id, data, type, source, is_canary)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET 
            data = EXCLUDED.data
          RETURNING id
        `;
        
        // Insert each row individually to collect IDs
        for (let i = 0; i < canaryCount; i++) {
          const canaryId = `${baseCanaryId}-${i.toString().padStart(2, '0')}`;
          
          const canaryData = {
            canary: true,
            baseId: baseCanaryId,
            index: i,
            timestamp: timestamp,
            kind: 'shadow_canary'
          };
          
          const result = await client.query(insertQuery, [
            canaryId,
            JSON.stringify(canaryData),
            'canary_test',
            'acceptance',
            true
          ]);
          
          insertedIds.push(result.rows[0].id);
        }
      } else {
        // Use Supabase client for insertion
        console.log(`  📦 Inserting ${canaryCount} rows using Supabase client...`);
        
        const canaryRows = [];
        for (let i = 0; i < canaryCount; i++) {
          // Generate proper UUID for id column
          const canaryUuid = randomUUID();
          
          const canaryData = {
            canary: true,
            baseId: baseCanaryId,
            canary_identifier: `${baseCanaryId}-${i.toString().padStart(2, '0')}`,
            index: i,
            timestamp: timestamp,
            kind: 'shadow_canary'
          };
          
          canaryRows.push({
            id: canaryUuid,
            metadata: canaryData, // Use existing metadata column  
            source: 'test',      // Keep short for varchar limits
            prop_category: 'player',  // Use allowed value
            // Add some required fields based on schema (keep all short)
            player_name: 'CANARY',
            sport: 'MLB',        // Use allowed sport value
            team: 'TEST',
            outcome: 'OVER',
            line: 1.0,
            odds: -110
          });
          
        }
        
        // Use insert for Supabase (not upsert to ensure new rows)
        const { data: insertedData, error: insertError } = await supabase
          .from('raw_props')
          .insert(canaryRows)
          .select('id');
          
        if (insertError) {
          throw new Error(`Supabase insert error: ${insertError.message}`);
        }
        
        // Track the successful insertions
        if (insertedData) {
          insertedIds.push(...insertedData.map(d => d.id));
        }
        
        console.log(`  ✅ Supabase inserted ${insertedData?.length || 0} rows`);
        
        // Verify the insertion was successful
        if (!insertedData || insertedData.length !== canaryRows.length) {
          throw new Error(`Expected ${canaryRows.length} insertions, got ${insertedData?.length || 0}`);
        }
      }
      
      console.log(`  ✅ Successfully inserted ${insertedIds.length} canary rows`);

      // Mark 70% as processed (simulate processing step)
      processedCount = Math.floor(insertedIds.length * 0.7); // 70% processed
      let processedMarkingStatus: string = 'skipped_no_rows';
      
      if (processedCount > 0) {
        const idsToProcess = insertedIds.slice(0, processedCount);
        
        console.log(`  🔄 Marking ${idsToProcess.length} rows as processed...`);
        
        if (usePg) {
          try {
            const updateQuery = `
              UPDATE public.raw_props 
              SET processed_at = NOW() 
              WHERE id = ANY($1::text[])
            `;
            
            await client.query(updateQuery, [idsToProcess]);
            processedMarkingStatus = 'db_update';
            console.log(`  ✅ Marked ${idsToProcess.length} rows as processed`);
          } catch (updateError) {
            processedMarkingStatus = 'skipped_no_column';
            console.log(`  ℹ️ processed_marking: skipped_no_column`);
          }
        } else {
          // For Supabase, attempt update but handle column existence gracefully
          try {
            const { error: updateError } = await supabase
              .from('raw_props')
              .update({ processed_at: new Date().toISOString() })
              .in('id', idsToProcess);
            
            if (updateError) {
              processedMarkingStatus = 'skipped_no_column';
              console.log(`  ℹ️ processed_marking: skipped_no_column`);
            } else {
              processedMarkingStatus = 'db_update';
              console.log(`  ✅ Marked ${idsToProcess.length} rows as processed`);
            }
          } catch (updateError) {
            processedMarkingStatus = 'skipped_no_column';
            console.log(`  ℹ️ processed_marking: skipped_no_column`);
          }
        }
      }
    } finally {
      if (usePg && client) {
        client.release();
      }
      // Supabase client doesn't need explicit release
    }

    const result: CanaryResult = {
      canaryId: baseCanaryId,
      insertedCount: insertedIds.length,
      processedCount: processedCount,
      timestamp,
      insertedIds,
    };

    // Write sidecar file
    const sidecarPath = join(process.cwd(), 'out', 'acceptance', 'last-seed.json');
    try {
      // Ensure the directory exists
      mkdirSync(join(process.cwd(), 'out', 'acceptance'), { recursive: true });
      
      const sidecarData = {
        canaryId: result.canaryId,
        insertedCount: result.insertedCount,
        processedCount: result.processedCount,
        insertedIds: result.insertedIds,
        timestamp: result.timestamp
      };
      
      writeFileSync(sidecarPath, JSON.stringify(sidecarData, null, 2));
      console.log(`📁 Sidecar written to: ${sidecarPath}`);
    } catch (sidecarError) {
      console.error(`⚠️ Failed to write sidecar file: ${sidecarError instanceof Error ? sidecarError.message : sidecarError}`);
    }

    console.log(`🎯 Successfully seeded ${result.insertedCount} canary rows (${result.processedCount} processed)`);
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
      insertedCount: insertedIds.length,
      processedCount: 0, // No processing attempted on failure
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
