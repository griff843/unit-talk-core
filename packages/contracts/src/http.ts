import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
  uptime: z.number().optional(),
  memory: z.record(z.any()).optional(),
});

export const MetricsResponse = z.object({
  ok: z.boolean(),
  metrics: z.record(z.any()).optional(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
export type MetricsResponse = z.infer<typeof MetricsResponse>;

