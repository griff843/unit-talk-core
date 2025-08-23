#!/usr/bin/env tsx
import '../../shared/bootstrapEnv';

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { getConfig } from '@unit-talk/config';
import { logger } from '@unit-talk/observability';

const OUTPUT_DIR = join(process.cwd(), 'out/acceptance');

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  timestamp: string;
  details?: any;
}

async function testEnvironmentVariables(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const timestamp = new Date().toISOString();

  try {
    logger.info('Testing environment configuration...');
    const config = getConfig();

    // Test required variables
    const requiredTests = [
      {
        key: 'DATABASE_URL',
        value: config.DATABASE_URL,
        test: 'Database URL configured',
      },
      {
        key: 'SUPABASE_URL',
        value: config.SUPABASE_URL,
        test: 'Supabase URL configured',
      },
      {
        key: 'SUPABASE_ANON_KEY',
        value: config.SUPABASE_ANON_KEY,
        test: 'Supabase anon key configured',
      },
      {
        key: 'SUPABASE_SERVICE_KEY',
        value: config.SUPABASE_SERVICE_KEY,
        test: 'Supabase service key configured',
      },
    ];

    for (const { key, value, test } of requiredTests) {
      if (value && value.length > 0) {
        results.push({
          test,
          status: 'PASS',
          message: `${key} is configured`,
          timestamp,
          details: { key, hasValue: true, length: value.length },
        });
      } else {
        results.push({
          test,
          status: 'FAIL',
          message: `${key} is missing or empty`,
          timestamp,
          details: { key, hasValue: false },
        });
      }
    }

    // Test feature flags
    const featureTests = [
      { key: 'SHADOW_MODE', value: config.SHADOW_MODE, expected: true },
      {
        key: 'PUBLISH_TO_DISCORD',
        value: config.PUBLISH_TO_DISCORD,
        expected: false,
      },
    ];

    for (const { key, value, expected } of featureTests) {
      const correct = value === expected;
      results.push({
        test: `Feature flag ${key} has correct default`,
        status: correct ? 'PASS' : 'FAIL',
        message: `${key}=${value}, expected=${expected}`,
        timestamp,
        details: { key, actual: value, expected, correct },
      });
    }

    // Test numeric values
    if (config.API_PORT >= 1 && config.API_PORT <= 65535) {
      results.push({
        test: 'API port is valid',
        status: 'PASS',
        message: `API_PORT=${config.API_PORT} is in valid range`,
        timestamp,
        details: { port: config.API_PORT },
      });
    } else {
      results.push({
        test: 'API port is valid',
        status: 'FAIL',
        message: `API_PORT=${config.API_PORT} is out of range`,
        timestamp,
        details: { port: config.API_PORT },
      });
    }

    logger.info('Environment configuration test completed');
  } catch (error) {
    results.push({
      test: 'Environment configuration loading',
      status: 'FAIL',
      message: `Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
      timestamp,
      details: { error: error instanceof Error ? error.stack : String(error) },
    });
  }

  return results;
}

async function main() {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const results = await testEnvironmentVariables();
    const outputFile = join(OUTPUT_DIR, 'env-test.json');

    writeFileSync(outputFile, JSON.stringify(results, null, 2));

    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    console.log(`Environment tests: ${passCount} PASS, ${failCount} FAIL`);
    console.log(`Results written to: ${outputFile}`);

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Environment test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
