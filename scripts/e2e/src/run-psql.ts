#!/usr/bin/env tsx

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { getConfig } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';
import postgres from 'postgres';

const OUTPUT_DIR = join(process.cwd(), 'out/acceptance');

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  timestamp: string;
  details?: any;
}

async function testDatabaseConnection(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const timestamp = new Date().toISOString();

  try {
    logger.info('Testing database connection...');
    const config = getConfig();
    const sql = postgres(config.DATABASE_URL);

    try {
      // Test basic connection
      const connectionTest = await sql`SELECT 1 as test_value`;
      results.push({
        test: 'Database connection',
        status: 'PASS',
        message: 'Successfully connected to database',
        timestamp,
        details: { testValue: connectionTest[0].test_value },
      });

      // Test migrations table exists
      const migrationTableTest = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '_migrations'
        ) as exists
      `;

      if (migrationTableTest[0].exists) {
        results.push({
          test: 'Migrations table exists',
          status: 'PASS',
          message: 'Migrations table found',
          timestamp,
        });
      } else {
        results.push({
          test: 'Migrations table exists',
          status: 'FAIL',
          message: 'Migrations table not found',
          timestamp,
        });
      }

      // Test expected tables exist
      const tables = ['raw_props', 'unified_picks'];
      for (const tableName of tables) {
        const tableTest = await sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${tableName}
          ) as exists
        `;

        results.push({
          test: `Table ${tableName} exists`,
          status: tableTest[0].exists ? 'PASS' : 'FAIL',
          message: tableTest[0].exists
            ? `Table ${tableName} found`
            : `Table ${tableName} not found`,
          timestamp,
        });
      }

      // Test indexes exist
      const expectedIndexes = [
        'idx_raw_props_inserted_at',
        'idx_raw_props_processed_at',
        'idx_unified_picks_promoted_at',
        'idx_unified_picks_raw_id',
      ];

      for (const indexName of expectedIndexes) {
        const indexTest = await sql`
          SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = ${indexName}
          ) as exists
        `;

        results.push({
          test: `Index ${indexName} exists`,
          status: indexTest[0].exists ? 'PASS' : 'FAIL',
          message: indexTest[0].exists
            ? `Index ${indexName} found`
            : `Index ${indexName} not found`,
          timestamp,
        });
      }

      // Test RLS is enabled on unified_picks
      const rlsTest = await sql`
        SELECT relrowsecurity as rls_enabled
        FROM pg_class 
        WHERE relname = 'unified_picks'
      `;

      if (rlsTest.length > 0 && rlsTest[0].rls_enabled) {
        results.push({
          test: 'RLS enabled on unified_picks',
          status: 'PASS',
          message: 'Row Level Security is enabled',
          timestamp,
        });
      } else {
        results.push({
          test: 'RLS enabled on unified_picks',
          status: 'FAIL',
          message: 'Row Level Security is not enabled',
          timestamp,
        });
      }
    } finally {
      await sql.end();
    }
  } catch (error) {
    results.push({
      test: 'Database connection',
      status: 'FAIL',
      message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
      timestamp,
      details: { error: error instanceof Error ? error.stack : String(error) },
    });
  }

  return results;
}

async function main() {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const results = await testDatabaseConnection();
    const outputFile = join(OUTPUT_DIR, 'psql-test.json');

    writeFileSync(outputFile, JSON.stringify(results, null, 2));

    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    console.log(`Database tests: ${passCount} PASS, ${failCount} FAIL`);
    console.log(`Results written to: ${outputFile}`);

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Database test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
