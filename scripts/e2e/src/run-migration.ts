#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { logger } from '@unit-talk/observability';

const OUTPUT_DIR = join(process.cwd(), 'out/acceptance');

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  timestamp: string;
  details?: any;
}

function runCommand(
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', data => {
      stdout += data.toString();
    });

    child.stderr?.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      resolve({ stdout, stderr, code: code || 0 });
    });
  });
}

async function testMigrations(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const timestamp = new Date().toISOString();

  try {
    logger.info('Testing migration dry-run...');

    // Test migration dry-run
    const dryRunResult = await runCommand('npm', [
      'run',
      'migrate:dry-run',
      '--workspace=packages/db',
    ]);

    if (dryRunResult.code === 0) {
      results.push({
        test: 'Migration dry-run',
        status: 'PASS',
        message: 'Migration dry-run completed successfully',
        timestamp,
        details: {
          stdout: dryRunResult.stdout,
          stderr: dryRunResult.stderr,
        },
      });
    } else {
      results.push({
        test: 'Migration dry-run',
        status: 'FAIL',
        message: `Migration dry-run failed with code ${dryRunResult.code}`,
        timestamp,
        details: {
          code: dryRunResult.code,
          stdout: dryRunResult.stdout,
          stderr: dryRunResult.stderr,
        },
      });
    }

    // Test migration up
    logger.info('Testing migration up...');
    const upResult = await runCommand('npm', [
      'run',
      'migrate:up',
      '--workspace=packages/db',
    ]);

    if (upResult.code === 0) {
      results.push({
        test: 'Migration up',
        status: 'PASS',
        message: 'Migration up completed successfully',
        timestamp,
        details: {
          stdout: upResult.stdout,
          stderr: upResult.stderr,
        },
      });
    } else {
      results.push({
        test: 'Migration up',
        status: 'FAIL',
        message: `Migration up failed with code ${upResult.code}`,
        timestamp,
        details: {
          code: upResult.code,
          stdout: upResult.stdout,
          stderr: upResult.stderr,
        },
      });
    }

    // Test idempotency by running migrations again
    logger.info('Testing migration idempotency...');
    const idempotencyResult = await runCommand('npm', [
      'run',
      'migrate:up',
      '--workspace=packages/db',
    ]);

    if (idempotencyResult.code === 0) {
      results.push({
        test: 'Migration idempotency',
        status: 'PASS',
        message: 'Migration up is idempotent (safe to run multiple times)',
        timestamp,
        details: {
          stdout: idempotencyResult.stdout,
          stderr: idempotencyResult.stderr,
        },
      });
    } else {
      results.push({
        test: 'Migration idempotency',
        status: 'FAIL',
        message: `Migration idempotency test failed with code ${idempotencyResult.code}`,
        timestamp,
        details: {
          code: idempotencyResult.code,
          stdout: idempotencyResult.stdout,
          stderr: idempotencyResult.stderr,
        },
      });
    }
  } catch (error) {
    results.push({
      test: 'Migration test suite',
      status: 'FAIL',
      message: `Migration tests failed: ${error instanceof Error ? error.message : String(error)}`,
      timestamp,
      details: { error: error instanceof Error ? error.stack : String(error) },
    });
  }

  return results;
}

async function main() {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const results = await testMigrations();
    const outputFile = join(OUTPUT_DIR, 'migration-test.json');

    writeFileSync(outputFile, JSON.stringify(results, null, 2));

    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    console.log(`Migration tests: ${passCount} PASS, ${failCount} FAIL`);
    console.log(`Results written to: ${outputFile}`);

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Migration test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
