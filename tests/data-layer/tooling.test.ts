// Tooling smoke test (data-layer task 1.1). Confirms Vitest, Zod and fast-check run offline.
// Not a data-layer behaviour test.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import { version as zodVersion } from 'zod/package.json' with { type: 'json' };

describe('test tooling', () => {
  it('runs Vitest', () => {
    expect(true).toBe(true);
  });

  it('runs a fast-check property', () => {
    fc.assert(fc.property(fc.integer(), (n) => n + 0 === n));
  });

  it('validates with Zod and uses major version 4', () => {
    expect(z.object({ a: z.string() }).safeParse({ a: 'x' }).success).toBe(true);
    expect(zodVersion.split('.')[0]).toBe('4');
  });
});
