import { z } from 'zod';

export const WorkflowInput = z.object({
  correlationId: z.string().min(1),
  params: z.record(z.any()).optional(),
});

export const WorkflowOutput = z.object({
  status: z.enum(['ok', 'error']),
  data: z.any().optional(),
  error: z.string().optional(),
});

// Representative outputs used by current worker workflows
export const PingOutput = z.string();
export const HealthCheckOutput = z.object({ status: z.string(), timestamp: z.string() });

export type WorkflowInput = z.infer<typeof WorkflowInput>;
export type WorkflowOutput = z.infer<typeof WorkflowOutput>;
export type PingOutput = z.infer<typeof PingOutput>;
export type HealthCheckOutput = z.infer<typeof HealthCheckOutput>;

