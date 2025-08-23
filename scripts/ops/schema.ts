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
  schema: z
    .object({
      ok: z.boolean(),
      missing: z.array(z.string()),
      found: z.array(z.string()),
      method: z.enum(['supabase', 'direct-pg', 'failed']).optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
  shadow_fallbacks: z
    .object({
      processed_fallback: z.boolean(),
      supabase_available: z.boolean(),
      fallback_reason: z.string().optional(),
    })
    .optional(),
  drift: z
    .object({
      ok: z.boolean(),
      risk_level: z.enum(['low', 'medium', 'high']),
      features_analyzed: z.number().int().nonnegative(),
      features_with_alerts: z.number().int().nonnegative().optional(),
      features_with_warnings: z.number().int().nonnegative().optional(),
      drift_score: z.number().min(0).max(1),
      error: z.string().optional(),
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
