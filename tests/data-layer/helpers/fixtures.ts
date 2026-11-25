// Reads test fixtures from disk at test time through Vite's `import.meta.glob`.
// No test contacts GitHub (Req 8.18).
import type { HttpResponseLike } from '../../../src/data/github/http-response';

export type CapturedFixture = {
  meta: {
    endpoint: string;
    capturedAt: string;
    source: string;
    capturedWith: string;
    status: number;
    redactions: string[];
    note?: string;
  };
  headers?: Record<string, string>;
  body: unknown;
};

export type ConstructedFixture = {
  meta: { constructed: true; case: string };
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
};

const capturedModules = import.meta.glob<CapturedFixture>('../../fixtures/github/captured/*.json', {
  eager: true,
  import: 'default',
});
const constructedModules = import.meta.glob<ConstructedFixture>('../../fixtures/github/constructed/*.json', {
  eager: true,
  import: 'default',
});

function byFileName<T>(modules: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(modules).map(([path, value]) => [path.split('/').pop() ?? path, value]));
}

const captured = byFileName(capturedModules);
const constructed = byFileName(constructedModules);

export const capturedFileNames = (): string[] => [...captured.keys()].sort();
export const constructedFileNames = (): string[] => [...constructed.keys()].sort();

// Each call returns a fresh copy, so a test can never change a fixture for another test.
function copy<T>(value: T): T {
  return structuredClone(value);
}

export function loadCaptured(name: string): CapturedFixture {
  const fixture = captured.get(name);
  if (!fixture) throw new Error(`Captured fixture not found: ${name}`);
  return copy(fixture);
}

export function loadConstructed(name: string): ConstructedFixture {
  const fixture = constructed.get(name);
  if (!fixture) throw new Error(`Constructed fixture not found: ${name}`);
  return copy(fixture);
}

/** The captured response as the error mapping and section adapters read it. */
export function capturedResponse(name: string): HttpResponseLike {
  const fixture = loadCaptured(name);
  return { status: fixture.meta.status, headers: fixture.headers ?? {}, body: fixture.body };
}

/** A constructed response. A `rawBody` is parsed the way a transport would parse it. */
export function constructedResponse(name: string): HttpResponseLike {
  const fixture = loadConstructed(name);
  const headers = fixture.headers ?? {};
  if (fixture.rawBody === undefined) {
    return { status: fixture.status, headers, body: fixture.body };
  }
  try {
    return { status: fixture.status, headers, body: JSON.parse(fixture.rawBody) };
  } catch {
    return { status: fixture.status, headers, body: null, bodyParseFailed: true };
  }
}
