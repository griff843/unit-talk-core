import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { parseOrReport } from '../src/helpers/parse';

// Mock env
process.env.CONTRACTS_STRICT = 'false';

describe('contracts: parseOrReport', () => {
  it('passes through valid data', () => {
    const S = z.object({ a: z.number() });
    const out = parseOrReport(S, { a: 1 }, 'unit.valid');
    assert.equal(out.a, 1);
  });

  it('logs on invalid when strict=false', () => {
    const S = z.object({ a: z.number() });
    const out = parseOrReport(S, { a: 'nope' } as any, 'unit.invalid');
    assert.equal((out as any).a, 'nope'); // passthrough
  });

  it('throws on invalid when strict=true', () => {
    process.env.CONTRACTS_STRICT = 'true';
    const S = z.object({ a: z.number() });
    assert.throws(() => parseOrReport(S, { a: 'nope' } as any, 'unit.strict'));
    process.env.CONTRACTS_STRICT = 'false';
  });
});

