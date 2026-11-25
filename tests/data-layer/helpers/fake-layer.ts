// Test helpers for the public data-layer functions (task 9.8).
// A fake transport answers from fixtures, records every call, and tracks how many requests
// run at the same time. Nothing here uses the network or the real `localStorage`.
import type { TransportRequest, RawResponse, Transport } from '../../../src/data/github/transport/types';
import { readNextPage } from '../../../src/data/github/transport/direct-transport';
import type { HttpResponseLike } from '../../../src/data/github/http-response';
import { createGitHubDataLayer, type DataLayerOptions, type GitHubDataLayer } from '../../../src/data/github/data-layer';
import { activityWindowStart } from '../../../src/data/github/detail-assembly';
import { capturedResponse } from './fixtures';

export const START = new Date('2026-11-22T13:00:00.000Z');
export const WINDOW_START = activityWindowStart(START);

function whole(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

export type RawExtras = {
  readonly fetchedAt?: string;
  readonly nextPage?: number | null;
  readonly remaining?: number | null;
  readonly resetAt?: string | null;
};

/** Turns a fixture response into the transport's raw-response format. */
export function rawFrom(response: HttpResponseLike, extras: RawExtras = {}): RawResponse {
  const reset = whole(response.headers['x-ratelimit-reset']);
  return {
    status: response.status,
    data: response.body,
    dataParseFailed: response.bodyParseFailed === true,
    fetchedAt: extras.fetchedAt ?? START.toISOString(),
    rateLimit: {
      route: 'direct',
      limit: whole(response.headers['x-ratelimit-limit']),
      remaining: extras.remaining !== undefined ? extras.remaining : whole(response.headers['x-ratelimit-remaining']),
      resetAt: extras.resetAt !== undefined ? extras.resetAt : reset === null ? null : new Date(reset * 1000).toISOString(),
      retryAfterSeconds: whole(response.headers['retry-after']),
      tokenUsed: false,
    },
    nextPage:
      extras.nextPage !== undefined ? extras.nextPage : readNextPage(response.headers.link ?? null),
    transportFailure: null,
  };
}

export function transportFailure(kind: 'network' | 'timeout' | 'cancelled'): RawResponse {
  return {
    status: 0,
    data: null,
    dataParseFailed: false,
    fetchedAt: START.toISOString(),
    rateLimit: { route: 'direct', limit: null, remaining: null, resetAt: null, retryAfterSeconds: null, tokenUsed: false },
    nextPage: null,
    transportFailure: kind,
  };
}

export type FakeTransport = Transport & {
  readonly calls: TransportRequest[];
  /** The largest number of requests that were running at the same time. */
  maxConcurrent(): number;
};

export type Handler = (request: TransportRequest, callNumber: number) => RawResponse | Promise<RawResponse>;

export function createFakeTransport(handler: Handler): FakeTransport {
  const calls: TransportRequest[] = [];
  let running = 0;
  let maxRunning = 0;
  return {
    route: 'direct',
    calls,
    maxConcurrent: () => maxRunning,
    async request(request) {
      calls.push(request);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      try {
        // Yield so requests started together really overlap.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return await handler(request, calls.length);
      } finally {
        running -= 1;
      }
    },
  };
}

/** A short name for a request, so a handler can answer by section. */
export function requestKey(request: TransportRequest): string {
  const query = request.query ?? {};
  if (request.endpointId === 'commits') {
    if ('since' in query) return 'commits:since';
    if ('path' in query) return 'commits:path';
    return 'commits:latest';
  }
  return request.endpointId;
}

/** The captured responses for one open repository: fast-check, active, with a manifest. */
export function defaultDetailResponses(): Record<string, HttpResponseLike> {
  return {
    repo: capturedResponse('repo.dubzzz.fast-check.json'),
    readme: capturedResponse('readme.dubzzz.fast-check.json'),
    'commits:latest': capturedResponse('commits-latest.dubzzz.fast-check.json'),
    issues: capturedResponse('issues.dubzzz.fast-check.json'),
    branches: capturedResponse('branches.dubzzz.fast-check.json'),
    'workflow-runs': capturedResponse('workflow-runs.dubzzz.fast-check.json'),
    'root-contents': capturedResponse('root-contents.ncptunex.foodstarter.json'),
    'commits:since': capturedResponse('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json'),
    'commits:path': capturedResponse('commits-manifest.ncptunex.foodstarter.json'),
  };
}

/**
 * A handler that answers detail requests from a table, with overrides per request key.
 * An override can be a response, a raw response (for transport failures) or a function.
 */
export function detailHandler(
  overrides: Record<string, HttpResponseLike | RawResponse | ((request: TransportRequest) => RawResponse)> = {},
): (request: TransportRequest, callNumber?: number) => RawResponse {
  const table = { ...defaultDetailResponses() };
  return (request) => {
    const key = requestKey(request);
    const override = overrides[key];
    if (typeof override === 'function') return override(request);
    if (override !== undefined) return 'fetchedAt' in override ? override : rawFrom(override);
    const response = table[key];
    return response ? rawFrom(response) : rawFrom({ status: 404, headers: {}, body: { message: 'Not Found' } });
  };
}

export type TestLayer = {
  readonly layer: GitHubDataLayer;
  readonly transport: FakeTransport;
  /** Moves the fake clock forward. */
  advance(ms: number): void;
};

export function createTestLayer(handler: Handler, options: Partial<DataLayerOptions> = {}): TestLayer {
  let current = START.getTime();
  const transport = createFakeTransport(handler);
  const layer = createGitHubDataLayer({
    transport,
    storage: null,
    now: () => new Date(current),
    ...options,
  });
  return { layer, transport, advance: (ms) => (current += ms) };
}
