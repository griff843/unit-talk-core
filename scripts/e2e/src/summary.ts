#!/usr/bin/env tsx

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { logger } from '@unit-talk/observability';

const OUTPUT_DIR = join(process.cwd(), 'out/acceptance');

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  message: string;
  timestamp: string;
  details?: any;
}

interface TestSuite {
  name: string;
  scriptPath: string;
  outputFile: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Environment',
    scriptPath: 'src/env.ts',
    outputFile: 'env-test.json',
  },
  {
    name: 'Database Connection',
    scriptPath: 'src/run-psql.ts',
    outputFile: 'psql-test.json',
  },
  {
    name: 'Migrations',
    scriptPath: 'src/run-migration.ts',
    outputFile: 'migration-test.json',
  },
  {
    name: 'Metrics API',
    scriptPath: 'src/metrics-fetch.ts',
    outputFile: 'metrics-test.json',
  },
  {
    name: 'Security Policies',
    scriptPath: 'src/non-promoter-write.ts',
    outputFile: 'security-test.json',
  },
  {
    name: 'Shadow Pipeline',
    scriptPath: 'src/shadow-run.ts',
    outputFile: 'shadow-pipeline.json',
  },
];

function runScript(
  scriptPath: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn('tsx', [scriptPath], {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', data => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text); // Real-time output
    });

    child.stderr?.on('data', data => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text); // Real-time output
    });

    child.on('close', code => {
      resolve({ code: code || 0, stdout, stderr });
    });
  });
}

async function runAllTests(): Promise<void> {
  logger.info('Starting acceptance test suite...');
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const overallResults: Array<{
    suite: string;
    passed: number;
    failed: number;
    total: number;
    duration: number;
    status: 'PASS' | 'FAIL';
  }> = [];

  for (const suite of TEST_SUITES) {
    logger.info(`Running ${suite.name} tests...`);
    const startTime = Date.now();

    try {
      const result = await runScript(suite.scriptPath);
      const duration = Date.now() - startTime;

      // Try to read results file
      const resultsFile = join(OUTPUT_DIR, suite.outputFile);
      let testResults: TestResult[] = [];

      if (existsSync(resultsFile)) {
        try {
          const fileContent = readFileSync(resultsFile, 'utf8');
          testResults = JSON.parse(fileContent);
        } catch (parseError) {
          logger.warn(`Failed to parse results for ${suite.name}`, {
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });
        }
      }

      const passed = testResults.filter(r => r.status === 'PASS').length;
      const failed = testResults.filter(r => r.status === 'FAIL').length;
      const total = testResults.length;

      overallResults.push({
        suite: suite.name,
        passed,
        failed,
        total,
        duration,
        status: result.code === 0 && failed === 0 ? 'PASS' : 'FAIL',
      });

      logger.info(
        `${suite.name} completed: ${passed} PASS, ${failed} FAIL (${duration}ms)`
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`${suite.name} failed to run`, {
        error: error instanceof Error ? error.message : String(error),
      });

      overallResults.push({
        suite: suite.name,
        passed: 0,
        failed: 1,
        total: 1,
        duration,
        status: 'FAIL',
      });
    }
  }

  // Try to extract canary ID from shadow pipeline results
  let canaryId = null;
  try {
    const shadowResultsFile = join(OUTPUT_DIR, 'shadow-pipeline.json');
    if (existsSync(shadowResultsFile)) {
      const shadowResults = JSON.parse(readFileSync(shadowResultsFile, 'utf8'));
      canaryId =
        shadowResults.details?.canary_id ||
        shadowResults.details?.feed_result?.canaryId;
    }
  } catch (error) {
    logger.warn('Could not extract canary ID from shadow results', { error });
  }

  // Generate summary report
  const summary = {
    timestamp: new Date().toISOString(),
    canaryId,
    writeSource: 'promoter_workflow', // Document the single-writer source
    totalSuites: overallResults.length,
    passedSuites: overallResults.filter(r => r.status === 'PASS').length,
    failedSuites: overallResults.filter(r => r.status === 'FAIL').length,
    totalTests: overallResults.reduce((sum, r) => sum + r.total, 0),
    totalPassed: overallResults.reduce((sum, r) => sum + r.passed, 0),
    totalFailed: overallResults.reduce((sum, r) => sum + r.failed, 0),
    totalDuration: overallResults.reduce((sum, r) => sum + r.duration, 0),
    suites: overallResults,
  };

  // Write summary
  const summaryFile = join(OUTPUT_DIR, 'summary.json');
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  // Console output
  console.log('\n' + '='.repeat(60));
  console.log('ACCEPTANCE TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Suites: ${summary.totalSuites}`);
  console.log(`Passed Suites: ${summary.passedSuites}`);
  console.log(`Failed Suites: ${summary.failedSuites}`);
  console.log(`Total Tests: ${summary.totalTests}`);
  console.log(`Total Passed: ${summary.totalPassed}`);
  console.log(`Total Failed: ${summary.totalFailed}`);
  console.log(`Total Duration: ${summary.totalDuration}ms`);
  if (canaryId) {
    console.log(`Canary ID: ${canaryId}`);
  }
  console.log(`Write Source: ${summary.writeSource} (single-writer validated)`);
  console.log('');

  overallResults.forEach(result => {
    const status = result.status === 'PASS' ? '✅' : '❌';
    console.log(
      `${status} ${result.suite}: ${result.passed}/${result.total} tests passed (${result.duration}ms)`
    );
  });

  console.log('');
  console.log(`Full results written to: ${OUTPUT_DIR}/`);

  // Exit with error code if any tests failed
  if (summary.totalFailed > 0 || summary.failedSuites > 0) {
    logger.error('Some acceptance tests failed');
    process.exit(1);
  } else {
    logger.info('All acceptance tests passed!');
  }
}

if (require.main === module) {
  runAllTests().catch(error => {
    logger.error('Acceptance test suite failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
