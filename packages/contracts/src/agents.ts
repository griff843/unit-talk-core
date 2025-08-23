import { z } from 'zod';

export const AgentInput = z.object({
  id: z.string().min(1),
  payload: z.record(z.any()).optional(),
  metadata: z.object({ shadow: z.boolean().optional() }).optional(),
});

export const AgentOutput = z.object({
  ok: z.boolean(),
  result: z.any().optional(),
  errors: z.array(z.string()).optional(),
});

export type AgentInput = z.infer<typeof AgentInput>;
export type AgentOutput = z.infer<typeof AgentOutput>;

