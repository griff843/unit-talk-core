#!/usr/bin/env tsx

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

async function testMetricsEndpoint(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const timestamp = new Date().toISOString();

  try {
    logger.info('Testing metrics endpoint...');
    const config = getConfig();
    const baseUrl = `http://localhost:${config.API_PORT}`;

    // Test health endpoint first
    logger.info('Testing health endpoint...');
    try {
      const healthResponse = await fetch(`${baseUrl}/api/health`);
      const healthData = await healthResponse.json();

      if (healthResponse.ok && healthData.status === 'ok') {
        results.push({
          test: 'Health endpoint',
          status: 'PASS',
          message: 'Health endpoint responds correctly',
          timestamp,
          details: { status: healthResponse.status, data: healthData },
        });
      } else {
        results.push({
          test: 'Health endpoint',
          status: 'FAIL',
          message: `Health endpoint failed: ${healthResponse.status}`,
          timestamp,
          details: { status: healthResponse.status, data: healthData },
        });
      }
    } catch (error) {
      results.push({
        test: 'Health endpoint',
        status: 'FAIL',
        message: `Health endpoint connection failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp,
        details: { error: String(error) },
      });
    }

    // Test metrics ingestion endpoint with valid data
    logger.info('Testing metrics ingestion with valid data...');
    try {
      const metricsPayload = {
        source: 'acceptance-test',
        timestamp: new Date().toISOString(),
        metrics: {
          cpu: 0.5,
          memory: 0.3,
          requests: 100,
        },
      };

      const metricsResponse = await fetch(`${baseUrl}/api/metrics/ingestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1, 10.0.0.1', // Test leftmost IP extraction
        },
        body: JSON.stringify(metricsPayload),
      });

      const metricsData = await metricsResponse.json();

      // Should always return 200, check success field
      if (metricsResponse.status === 200 && metricsData.success) {
        results.push({
          test: 'Metrics ingestion (valid data)',
          status: 'PASS',
          message: 'Metrics ingestion accepts valid data',
          timestamp,
          details: {
            status: metricsResponse.status,
            data: metricsData,
            duration: metricsData.duration,
          },
        });
      } else {
        results.push({
          test: 'Metrics ingestion (valid data)',
          status: 'FAIL',
          message: `Metrics ingestion failed: ${metricsData.message || 'Unknown error'}`,
          timestamp,
          details: { status: metricsResponse.status, data: metricsData },
        });
      }
    } catch (error) {
      results.push({
        test: 'Metrics ingestion (valid data)',
        status: 'FAIL',
        message: `Metrics ingestion connection failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp,
        details: { error: String(error) },
      });
    }

    // Test metrics ingestion with invalid data (should return 200 with success: false)
    logger.info('Testing metrics ingestion with invalid data...');
    try {
      const invalidPayload = null;

      const invalidResponse = await fetch(`${baseUrl}/api/metrics/ingestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidPayload),
      });

      const invalidData = await invalidResponse.json();

      // Should return 200 with success: false for invalid data
      if (invalidResponse.status === 200 && invalidData.success === false) {
        results.push({
          test: 'Metrics ingestion (invalid data)',
          status: 'PASS',
          message: 'Metrics ingestion correctly handles invalid data',
          timestamp,
          details: {
            status: invalidResponse.status,
            data: invalidData,
          },
        });
      } else {
        results.push({
          test: 'Metrics ingestion (invalid data)',
          status: 'FAIL',
          message: `Metrics ingestion should return success:false for invalid data`,
          timestamp,
          details: { status: invalidResponse.status, data: invalidData },
        });
      }
    } catch (error) {
      results.push({
        test: 'Metrics ingestion (invalid data)',
        status: 'FAIL',
        message: `Invalid data test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp,
        details: { error: String(error) },
      });
    }

    // Test rate limiting (if possible)
    logger.info('Testing basic rate limiting behavior...');
    try {
      const rateLimitRequests = [];
      for (let i = 0; i < 5; i++) {
        rateLimitRequests.push(
          fetch(`${baseUrl}/api/metrics/ingestion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: `rate-limit-${i}` }),
          })
        );
      }

      const rateLimitResponses = await Promise.all(rateLimitRequests);
      const allReturned200 = rateLimitResponses.every(r => r.status === 200);

      if (allReturned200) {
        results.push({
          test: 'Rate limiting behavior',
          status: 'PASS',
          message: 'Rate limiting allows reasonable request volume',
          timestamp,
          details: {
            requestCount: rateLimitResponses.length,
            statuses: rateLimitResponses.map(r => r.status),
          },
        });
      } else {
        results.push({
          test: 'Rate limiting behavior',
          status: 'FAIL',
          message: 'Rate limiting blocked reasonable request volume',
          timestamp,
          details: {
            requestCount: rateLimitResponses.length,
            statuses: rateLimitResponses.map(r => r.status),
          },
        });
      }
    } catch (error) {
      results.push({
        test: 'Rate limiting behavior',
        status: 'FAIL',
        message: `Rate limit test failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp,
        details: { error: String(error) },
      });
    }
  } catch (error) {
    results.push({
      test: 'Metrics endpoint test suite',
      status: 'FAIL',
      message: `Metrics tests failed: ${error instanceof Error ? error.message : String(error)}`,
      timestamp,
      details: { error: error instanceof Error ? error.stack : String(error) },
    });
  }

  return results;
}

async function main() {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const results = await testMetricsEndpoint();
    const outputFile = join(OUTPUT_DIR, 'metrics-test.json');

    writeFileSync(outputFile, JSON.stringify(results, null, 2));

    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    console.log(`Metrics tests: ${passCount} PASS, ${failCount} FAIL`);
    console.log(`Results written to: ${outputFile}`);

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Metrics test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
