/**
 * Example business logic functions demonstrating proper use of ports
 * for dependency inversion in pure business logic.
 */

import { z } from 'zod';

import type { Ports, Duration } from './ports';

// ===== SIMPLE EXAMPLE =====

/**
 * Simple example showing proper dependency injection pattern
 */
export async function simpleProcessingExample(
  data: unknown,
  ports: Ports
): Promise<{ processed: boolean; timestamp: string; config: string }> {
  // Use Clock port for time operations
  const timestamp = ports.clock.now();

  // Use Env port for configuration
  const config =
    ports.env.getStringOptional('PROCESSING_MODE', 'standard') || 'standard';

  // Use External port for events
  await ports.external.publish({
    type: 'processing-started',
    source: 'simple-example',
    data: { timestamp, config },
  });

  // Pure business logic
  const processed = data !== null && data !== undefined;

  return { processed, timestamp, config };
}

// ===== COMPLEX EXAMPLE =====

const ProcessingRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['feed_item', 'grading_result', 'promotion_candidate']),
  data: z.record(z.unknown()),
  priority: z.number().min(1).max(10).default(5),
});

export type ProcessingRequest = z.infer<typeof ProcessingRequestSchema>;

/**
 * More complex example using multiple ports
 */
export async function complexProcessingExample(
  rawRequest: unknown,
  ports: Ports
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    // Validate input
    const parseResult = ProcessingRequestSchema.safeParse(rawRequest);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Validation failed: ${parseResult.error.errors.map(e => e.message).join(', ')}`,
      };
    }

    const request = parseResult.data;

    // Use multiple ports together
    const startTime = ports.clock.nowAsDate();
    const enableCache = ports.env.getBooleanOptional('ENABLE_CACHE', true);

    // Database operation
    const existingQuery = {
      name: 'check-existing',
      sql: 'SELECT id FROM processed_requests WHERE id = $1',
      params: { id: request.id },
      execute: async () => ({ exists: false }),
    };

    const existing = await ports.db.query(existingQuery);
    if ((existing as any).exists) {
      return { success: false, error: 'Already processed' };
    }

    // HTTP operation (if needed)
    if (request.type === 'feed_item') {
      await ports.http.get(`https://api.example.com/validate/${request.id}`);
    }

    // File operation
    await ports.files.writeText(
      `/tmp/processing-${request.id}.log`,
      `Started processing at ${ports.clock.formatToISO(startTime)}`
    );

    // Business logic
    const result = {
      id: request.id,
      processed: true,
      processingTime: ports.clock.getDuration(
        startTime,
        ports.clock.nowAsDate()
      ),
      cacheEnabled: enableCache,
    };

    // Store result
    const insertQuery = {
      name: 'store-result',
      sql: 'INSERT INTO processed_requests (id, result) VALUES ($1, $2)',
      params: { id: request.id, result: JSON.stringify(result) },
      execute: async () => ({ inserted: true }),
    };

    await ports.db.query(insertQuery);

    // Publish completion event
    await ports.external.publish({
      type: 'processing-completed',
      source: 'complex-example',
      data: result,
    });

    // Cleanup
    await ports.files.delete(`/tmp/processing-${request.id}.log`);

    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Example showing time-based business logic
 */
export function calculateSchedulingWindow(
  priority: number,
  currentLoad: number,
  ports: Ports
): { scheduleAt: string; reason: string } {
  const now = ports.clock.nowAsDate();

  let delayDuration: Duration;
  let reason: string;

  if (currentLoad > 80) {
    delayDuration = { minutes: Math.max(1, 11 - priority) };
    reason = 'high_load';
  } else if (priority <= 3) {
    delayDuration = { seconds: 30 };
    reason = 'low_priority';
  } else {
    delayDuration = { seconds: 5 };
    reason = 'standard_processing';
  }

  const scheduleAt = ports.clock.addDuration(now, delayDuration);

  return {
    scheduleAt: ports.clock.formatToISO(scheduleAt),
    reason,
  };
}

/**
 * Example showing configuration-driven logic
 */
export function createProcessingConfig(ports: Ports): {
  maxRetries: number;
  timeout: number;
  enableDebugging: boolean;
  processingMode: string;
} {
  return {
    maxRetries: ports.env.getNumberOptional('MAX_RETRIES', 3) ?? 3,
    timeout: ports.env.getNumberOptional('TIMEOUT_MS', 30000) ?? 30000,
    enableDebugging: ports.env.getBooleanOptional('DEBUG_MODE', false) ?? false,
    processingMode:
      ports.env.getStringOptional('PROCESSING_MODE', 'production') ??
      'production',
  };
}
