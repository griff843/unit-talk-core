import { ZodSchema } from 'zod';
import { appendViolation } from './logger';

function isStrict(): boolean {
  const v = process.env.CONTRACTS_STRICT;
  return String(v).toLowerCase() === 'true';
}

export function parseOrReport<T>(schema: ZodSchema<T>, value: unknown, context: string): T {
  const strict = isStrict();
  const res = schema.safeParse(value);
  if (res.success) return res.data;
  const error = res.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  appendViolation({ timestamp: new Date().toISOString(), strict, context, error });
  if (strict) {
    throw new Error(`Contract violation (${context}): ${error}`);
  }
  return value as T; // non-strict: pass-through
}

