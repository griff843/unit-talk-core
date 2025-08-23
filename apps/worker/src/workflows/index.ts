import { proxyActivities } from '@temporalio/workflow';

import type { activities } from '../activities/index.js';

// Create activity proxies
const { ping, healthCheck } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

// Placeholder workflows - no business logic yet
export async function pingWorkflow(): Promise<string> {
  return await ping();
}

export async function healthCheckWorkflow(): Promise<{
  status: string;
  timestamp: string;
}> {
  return await healthCheck();
}
