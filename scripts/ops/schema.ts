import { z } from 'zod';

export const BreachSeverity = z.enum(['low', 'med', 'high']);

export const Breach = z.object({
  name: z.string(),
  severity: BreachSeverity,
  details: z.record(z.unknown()).optional(),
});

export type Breach = z.infer<typeof Breach>;

export const Components = z.object({
  parity: z
    .object({
      ok: z.boolean(),
      details: z.unknown().optional(),
    })
    .optional(),
  rls: z
    .object({
      ok: z.boolean(),
      violations: z.number().int().nonnegative().optional(),
    })
    .optional(),
  temporal: z
    .object({
      ok: z.boolean(),
      backlog_age_sec: z.number().int().nonnegative().optional(),
      failures: z.number().int().nonnegative().optional(),
    })
    .optional(),
  discord: z
    .object({
      ok: z.boolean(),
      dryRun: z.boolean().optional(),
    })
    .optional(),
  db: z
    .object({
      ok: z.boolean(),
      rls_enabled: z.boolean().optional(),
    })
    .optional(),
  supabase: z
    .object({
      ok: z.boolean(),
    })
    .optional(),
});

export const OpsReport = z.object({
  ok: z.boolean(),
  breaches: z.array(Breach),
  samples: z.number().int().nonnegative().optional(),
  runtime_ms: z.number().int().nonnegative(),
  timestamp: z.string(),
  components: Components,
});

export type OpsReport = z.infer<typeof OpsReport>;
export type Components = z.infer<typeof Components>;
