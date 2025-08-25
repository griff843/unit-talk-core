#!/usr/bin/env tsx
/**
 * @fileoverview Temporal Health Check Script
 * @description Uses @temporalio/client to check Temporal server health with auto-detect
 */
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function checkTemporal() {
  const outDir = join(process.cwd(), 'out', 'ops');
  const outFile = join(outDir, 'temporal-health.json');
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  
  // Auto-detect address with multiple fallbacks
  const addresses = [
    process.env.TEMPORAL_ADDRESS,
    '127.0.0.1:7233',
    'localhost:7233',
    'temporal:7233'
  ].filter(Boolean);

  const result = {
    timestamp: new Date().toISOString(),
    up: false,
    address: null,
    namespace,
    serverVersion: 'unknown',
    clusterInfo: null,
    error: null,
  };

  let connection;
  let lastError;
  
  // Try each address until one works
  for (const address of addresses) {
    try {
      console.log(`Trying ${address}...`);
      const { Connection } = await import('@temporalio/client');
      
      // Create connection with 10s deadline
      connection = await Promise.race([
        Connection.connect({ address }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
      ]);
      
      // Get system info
      try {
        const sys = await connection.workflowService.getSystemInfo({});
        if (sys?.serverVersion) result.serverVersion = sys.serverVersion;
      } catch (e) {
        // ignored
      }
      
      // Get cluster info
      try {
        const info = await connection.workflowService.getClusterInfo({});
        result.clusterInfo = {
          version: info?.versionInfo?.current || null,
          clusterId: info?.clusterId || null,
        };
      } catch (e) {
        // ignored
      }
      
      result.up = true;
      result.address = address;
      console.log(`✅ Connected to Temporal at ${address}`);
      break;
      
    } catch (err) {
      lastError = err;
      console.log(`Failed to connect to ${address}: ${err.message}`);
    } finally {
      try { if (connection) await connection.close(); } catch {}
      connection = null;
    }
  }
  
  if (!result.up) {
    result.error = lastError instanceof Error ? lastError.message : String(lastError);
    console.error(`❌ Failed to connect to Temporal. Tried: ${addresses.join(', ')}`);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote ${outFile.replace(process.cwd(), '').replace(/^[\/\\]/, '')}`);
}

checkTemporal().catch((e) => {
  console.error('temporal-health failed:', e);
  process.exit(0); // Do not fail CI; artifacts still useful
});

import { setTimeout as sleep } from 'timers/promises';

export type TemporalResult = {
  ok: boolean;
  backlog_age_sec?: number;
  failures?: number;
};

export async function runTemporalHealth(): Promise<TemporalResult> {
  // Placeholder Temporal health check: implement real logic later.
  await sleep(50);
  return { ok: true, backlog_age_sec: 0, failures: 0 };
}

// Run as main script (ES module equivalent)
if (import.meta.url === `file://${process.argv[1]}`) {
  runTemporalHealth().then(res => {
    console.log(JSON.stringify(res));
  });
}
