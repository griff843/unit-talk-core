#!/usr/bin/env tsx

/**
 * Canary monitoring script for production health validation
 * Collects metrics over time window and validates system health
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { logger } from '@unit-talk/observability';

interface MetricsSnapshot {
  timestamp: string;
  status: number;
  data?: {
    raw_new_5min: number;
    processed_5min: number;
    promoted_5min: number;
    window_start: string;
    window_end: string;
  };
  error?: string;
}

interface CanaryReport {
  ok: boolean;
  duration_minutes: number;
  samples_collected: number;
  total_promoted: number;
  avg_promotions_per_5min: number;
  health_score: number;
  first_sample: MetricsSnapshot;
  last_sample: MetricsSnapshot;
  issues: string[];
}

async function collectMetricsSample(apiPort: number): Promise<MetricsSnapshot> {
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(
      `http://localhost:${apiPort}/api/metrics/ingestion?window=5`
    );

    if (!response.ok) {
      return {
        timestamp,
        status: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();

    return {
      timestamp,
      status: 200,
      data: {
        raw_new_5min: data.raw_new_5min || 0,
        processed_5min: data.processed_5min || 0,
        promoted_5min: data.promoted_5min || 0,
        window_start: data.window_start,
        window_end: data.window_end,
      },
    };
  } catch (error) {
    return {
      timestamp,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runCanaryMonitoring(
  durationMinutes: number = 10,
  apiPort: number = 3010,
  intervalSeconds: number = 120
): Promise<CanaryReport> {
  const samples: MetricsSnapshot[] = [];
  const issues: string[] = [];

  logger.info('Starting canary monitoring', {
    duration: durationMinutes,
    apiPort,
    interval: intervalSeconds,
  });

  const startTime = Date.now();
  const endTime = startTime + durationMinutes * 60 * 1000;

  // Collect samples over the time window
  while (Date.now() < endTime) {
    const sample = await collectMetricsSample(apiPort);
    samples.push(sample);

    logger.debug('Collected metrics sample', {
      timestamp: sample.timestamp,
      status: sample.status,
      promoted: sample.data?.promoted_5min || 0,
    });

    // Validate sample quality
    if (sample.status !== 200) {
      issues.push(`Sample at ${sample.timestamp}: ${sample.error}`);
    }

    // Wait for next interval (unless this is the last sample)
    if (Date.now() + intervalSeconds * 1000 < endTime) {
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
    }
  }

  // Analyze results
  const validSamples = samples.filter(s => s.status === 200 && s.data);

  if (validSamples.length === 0) {
    issues.push('No valid samples collected - system appears unhealthy');
  }

  const totalPromoted = validSamples.reduce(
    (sum, s) => sum + (s.data?.promoted_5min || 0),
    0
  );
  const avgPromotionsPerWindow =
    validSamples.length > 0 ? totalPromoted / validSamples.length : 0;

  // Health scoring
  let healthScore = 0;

  // 40% - API availability
  const apiAvailability =
    samples.length > 0 ? validSamples.length / samples.length : 0;
  healthScore += apiAvailability * 40;

  // 40% - Promotion activity (non-zero promotions indicate healthy workflow)
  const hasPromotions = totalPromoted > 0;
  healthScore += hasPromotions ? 40 : 0;

  // 20% - Consistency (low variance in promotion rates)
  if (validSamples.length >= 3) {
    const promotionRates = validSamples.map(s => s.data?.promoted_5min || 0);
    const mean =
      promotionRates.reduce((a, b) => a + b, 0) / promotionRates.length;
    const variance =
      promotionRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) /
      promotionRates.length;
    const consistency =
      variance < mean ? 20 : Math.max(0, 20 - (variance - mean));
    healthScore += consistency;
  }

  // Final validation
  const ok = healthScore >= 70 && totalPromoted > 0 && apiAvailability >= 0.8;

  if (!ok) {
    if (healthScore < 70)
      issues.push(
        `Health score ${healthScore.toFixed(1)} below threshold (70)`
      );
    if (totalPromoted === 0)
      issues.push('Zero promotions detected - workflow may be broken');
    if (apiAvailability < 0.8)
      issues.push(
        `API availability ${(apiAvailability * 100).toFixed(1)}% below threshold (80%)`
      );
  }

  return {
    ok,
    duration_minutes: durationMinutes,
    samples_collected: samples.length,
    total_promoted: totalPromoted,
    avg_promotions_per_5min: Number(avgPromotionsPerWindow.toFixed(2)),
    health_score: Number(healthScore.toFixed(1)),
    first_sample: samples[0],
    last_sample: samples[samples.length - 1],
    issues,
  };
}

async function main() {
  try {
    const durationMinutes = parseInt(process.env.CANARY_DURATION || '10', 10);
    const apiPort = parseInt(process.env.API_PORT || '3010', 10);
    const intervalSeconds = parseInt(process.env.CANARY_INTERVAL || '120', 10);

    // Ensure output directory exists
    const outputDir = join(process.cwd(), 'out', 'canary');
    mkdirSync(outputDir, { recursive: true });

    // Run canary monitoring
    const report = await runCanaryMonitoring(
      durationMinutes,
      apiPort,
      intervalSeconds
    );

    // Save report
    const reportFile = join(outputDir, `canary-${Date.now()}.json`);
    writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Output results
    console.log(
      JSON.stringify(
        {
          status: report.ok ? 'CANARY_OK' : 'CANARY_FAIL',
          health_score: report.health_score,
          total_promoted: report.total_promoted,
          samples: report.samples_collected,
          issues: report.issues,
          report_file: reportFile,
        },
        null,
        2
      )
    );

    logger.info('Canary monitoring completed', {
      status: report.ok ? 'OK' : 'FAIL',
      healthScore: report.health_score,
      totalPromoted: report.total_promoted,
      reportFile,
    });

    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    logger.error('Canary monitoring failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    console.log(
      JSON.stringify(
        {
          status: 'CANARY_ERROR',
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );

    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
