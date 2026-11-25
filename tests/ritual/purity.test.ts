// Purity and layer tests (task 7.3, U13; Req 10.1, 13.7), plus separation of test-only data.
// Reads the project's own files as text. Never contacts GitHub.
import { describe, expect, it } from 'vitest';

function raw(modules: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(modules).map(([path, text]) => [path, String(text)]));
}

const ritualFiles = raw(import.meta.glob('../../src/ritual/**/*.ts', { query: '?raw', import: 'default', eager: true }));
const stateFiles = raw(import.meta.glob('../../src/state/**/*.ts', { query: '?raw', import: 'default', eager: true }));
const srcFiles = raw(import.meta.glob('../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }));

/** Removes comments, so a sentence that mentions `fetch` is not mistaken for a call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const IMPORT = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiers(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');
}

describe('src/ritual is pure (U13)', () => {
  it('finds the ritual files', () => {
    expect(Object.keys(ritualFiles).length).toBeGreaterThan(5);
  });

  it('imports no React, Zod, transport, adapter, schema, cache or state code, and only data-layer types', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(ritualFiles)) {
      const code = stripComments(source);
      for (const specifier of specifiers(code)) {
        const isDataLayer = /(^|\/)data\//.test(specifier);
        const forbidden =
          /^react($|\/)|^zod($|\/)|(^|\/)state\//.test(specifier) ||
          (isDataLayer && !/(^|\/)data\/github\/types$/.test(specifier));
        if (forbidden) offenders.push(`${path} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('data-layer imports in the domain are type-only', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(ritualFiles)) {
      for (const line of stripComments(source).split('\n')) {
        if (/from\s*['"][^'"]*data\//.test(line) && !/^\s*import\s+type\b/.test(line)) {
          // A multi-line `import type {` starts with `import type`, so only a plain import reaches here.
          if (!/^\s*}\s*from/.test(line)) offenders.push(`${path}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no fetch, localStorage, Date.now, new Date() with no argument, Math.random or Intl', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(ritualFiles)) {
      const code = stripComments(source);
      for (const pattern of [/\bfetch\b/, /\blocalStorage\b/, /Date\.now\b/, /new Date\(\s*\)/, /Math\.random\b/, /\bIntl\b/]) {
        if (pattern.test(code)) offenders.push(`${path} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('src/state keeps to its layer', () => {
  it('imports no transport, adapter, schema or cache code from the data layer', () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(stateFiles)) {
      for (const specifier of specifiers(stripComments(source))) {
        if (/(^|\/)data\//.test(specifier) && !/(^|\/)data\/github$/.test(specifier)) {
          offenders.push(`${path} imports ${specifier}`);
        }
        if (/^react($|\/)/.test(specifier)) offenders.push(`${path} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses Zod and localStorage only in the progress store', () => {
    for (const [path, source] of Object.entries(stateFiles)) {
      const code = stripComments(source);
      if (!path.endsWith('progress-store.ts')) {
        expect(/from\s*['"]zod['"]/.test(code), path).toBe(false);
        expect(/\blocalStorage\b/.test(code), path).toBe(false);
      }
    }
  });

  it('never touches a graverepo: cache key, and uses the progress prefix', () => {
    const store = Object.entries(stateFiles).find(([path]) => path.endsWith('progress-store.ts'))?.[1] ?? '';
    expect(store).toContain('graverepo-progress:');
    expect(stripComments(store)).not.toMatch(/['"`]graverepo:/);
  });
});

describe('test-only data stays out of production', () => {
  it('no file in src/ mentions the test owner, the test demo or the test builders', () => {
    const offenders = Object.entries(srcFiles)
      .filter(([, source]) => /test-owner|loadTestOnlyDemoGraveyard|TEST_DEMO|tests\/ritual/.test(source))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
