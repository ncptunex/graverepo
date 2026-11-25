// Cross-cutting tests for the public functions (tasks 9.7, 9.8 and 9.9; design 8.3, 8.9;
// Req 6.9, 8.10, 8.16, 9.2, 9.3, 10.3). Nothing here touches the network or the real storage.
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubDataLayer } from '../../src/data/github/data-layer';
import {
  capturedFileNames,
  constructedFileNames,
  loadCaptured,
  loadConstructed,
} from './helpers/fixtures';
import {
  createFakeTransport,
  createTestLayer,
  detailHandler,
  rawFrom,
  transportFailure,
  type Handler,
} from './helpers/fake-layer';
import type { DataResult } from '../../src/data/github/types';

const MINUTE = 60_000;

function isDataResult(value: unknown): value is DataResult<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as { ok?: unknown; rateLimit?: unknown; error?: { kind?: unknown } };
  if (typeof result.ok !== 'boolean' || typeof result.rateLimit !== 'object') return false;
  return result.ok || typeof result.error?.kind === 'string';
}

/** Every fixture, as a response that a transport could hand back. */
function everyFixtureAsRaw() {
  const fixtures = [
    ...capturedFileNames().map((name) => {
      const fixture = loadCaptured(name);
      return { status: fixture.meta.status, headers: fixture.headers ?? {}, body: fixture.body };
    }),
    ...constructedFileNames().map((name) => {
      const fixture = loadConstructed(name);
      const headers = fixture.headers ?? {};
      if (fixture.rawBody === undefined) return { status: fixture.status, headers, body: fixture.body };
      try {
        return { status: fixture.status, headers, body: JSON.parse(fixture.rawBody) as unknown };
      } catch {
        return { status: fixture.status, headers, body: null, bodyParseFailed: true };
      }
    }),
  ];
  return fixtures.map((response) => rawFrom(response));
}

describe('no public function throws (Req 6.9)', () => {
  it('returns a data result for every fixture, used as the answer to every request', async () => {
    for (const raw of everyFixtureAsRaw()) {
      const { layer } = createTestLayer(() => raw);
      const results = [
        await layer.lookupUser('ncptunex'),
        await layer.listRepositories('ncptunex'),
        await layer.getRepositoryDetail('ncptunex', 'foodstarter'),
      ];
      for (const result of results) expect(isDataResult(result)).toBe(true);
      expect(isDataResult(await layer.loadDemoGraveyard())).toBe(true);
    }
  });

  it.each(['network', 'timeout', 'cancelled'] as const)('returns a data result for a %s transport failure', async (kind) => {
    const { layer } = createTestLayer(() => transportFailure(kind));
    expect(isDataResult(await layer.lookupUser('ncptunex'))).toBe(true);
    expect(isDataResult(await layer.listRepositories('ncptunex'))).toBe(true);
    expect(isDataResult(await layer.getRepositoryDetail('ncptunex', 'foodstarter'))).toBe(true);
  });

  it('returns a data result when the transport itself throws', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { layer } = createTestLayer(() => {
      throw new Error('boom');
    });
    const user = await layer.lookupUser('ncptunex');
    const list = await layer.listRepositories('ncptunex');
    const detail = await layer.getRepositoryDetail('ncptunex', 'foodstarter');
    for (const result of [user, list, detail]) {
      expect(isDataResult(result)).toBe(true);
      expect(!result.ok && result.error.kind).toBe('network');
    }
    errors.mockRestore();
  });

  it('property: any input text gives a data result, never an exception', async () => {
    const { layer } = createTestLayer(detailHandler());
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 60 }), fc.string({ maxLength: 60 }), async (first, second) => {
        expect(isDataResult(await layer.lookupUser(first))).toBe(true);
        expect(isDataResult(await layer.listRepositories(first))).toBe(true);
        expect(isDataResult(await layer.getRepositoryDetail(first, second))).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it('property: any JSON body as a response gives a data result', async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), fc.constantFrom(200, 404, 409, 500), async (body, status) => {
        const { layer } = createTestLayer(() => rawFrom({ status, headers: {}, body }));
        expect(isDataResult(await layer.lookupUser('ncptunex'))).toBe(true);
        expect(isDataResult(await layer.listRepositories('ncptunex'))).toBe(true);
        expect(isDataResult(await layer.getRepositoryDetail('ncptunex', 'foodstarter'))).toBe(true);
      }),
      { numRuns: 60 },
    );
  });
});

describe('every result carries the rate-limit status (Req 9.2, 9.3)', () => {
  it('includes the status in successes and in errors', async () => {
    const { layer } = createTestLayer(detailHandler());
    const ok = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    const invalid = await layer.lookupUser('');
    expect(ok.rateLimit.route).toBe('direct');
    expect(ok.rateLimit.limit).toBe(60);
    expect(invalid.rateLimit.route).toBe('direct');
  });

  it('getRateLimitStatus sends no request and reports the latest values', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    expect(layer.getRateLimitStatus().direct).toMatchObject({ limit: null, remaining: null, tokenUsed: false });
    await layer.getRepositoryDetail('dubzzz', 'fast-check');
    const calls = transport.calls.length;
    const status = layer.getRateLimitStatus();
    expect(status.direct.limit).toBe(60);
    expect(status.direct.remaining).not.toBeNull();
    expect(status.proxy.limit).toBeNull();
    expect(transport.calls).toHaveLength(calls);
  });
});

describe('startup and demo (Req 8.10, 8.13, 8.16)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creating the data layer and reading the status send no request', () => {
    const transport = createFakeTransport(() => transportFailure('network'));
    const layer = createGitHubDataLayer({ transport, storage: null });
    layer.getRateLimitStatus();
    expect(transport.calls).toHaveLength(0);
  });

  it('importing the public index and using the local functions never calls fetch', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('GitHub must not be called')));
    vi.stubGlobal('fetch', fetchSpy);
    const index = await import('../../src/data/github/index');
    index.getRateLimitStatus();
    index.estimateDetailRequests({ owner: 'o', name: 'r', hasIssues: true, pushedAt: null });
    await index.loadDemoGraveyard();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never returns demo data for a searched username, even when GitHub cannot be reached', async () => {
    const { layer } = createTestLayer(() => transportFailure('network'));
    for (const result of [await layer.lookupUser('ncptunex'), await layer.listRepositories('ncptunex')]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.demoAvailable).toBe(true);
    }
  });

  it('property: a result is `live` exactly when this call made a request, never when served from the cache', async () => {
    type Step = { advanceMinutes: number; online: boolean; call: 'user' | 'list' | 'detail' };
    const step = fc.record({
      advanceMinutes: fc.integer({ min: 0, max: 45 }),
      online: fc.boolean(),
      call: fc.constantFrom<Step['call']>('user', 'list', 'detail'),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 8 }), async (steps) => {
        let online = true;
        const base: Handler = (request, number) => {
          if (!online) return transportFailure('network');
          if (request.endpointId === 'user') return rawFrom({ status: 200, headers: {}, body: userBody() });
          if (request.endpointId === 'user-repos') return rawFrom({ status: 200, headers: {}, body: [] });
          return detailHandler()(request, number);
        };
        const { layer, transport, advance } = createTestLayer(base);
        for (const item of steps) {
          advance(item.advanceMinutes * MINUTE);
          online = item.online;
          const before = transport.calls.length;
          const result =
            item.call === 'user'
              ? await layer.lookupUser('ncptunex')
              : item.call === 'list'
                ? await layer.listRepositories('ncptunex')
                : await layer.getRepositoryDetail('dubzzz', 'fast-check');
          const madeRequest = transport.calls.length > before;
          if (result.ok && result.provenance.source === 'live') expect(madeRequest).toBe(true);
          if (!madeRequest && result.ok) expect(result.provenance.source).toBe('cache');
          if (result.ok && result.provenance.source === 'cache' && result.provenance.stale) {
            expect(result.refreshError).toBeDefined();
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});

function userBody() {
  return {
    login: 'ncptunex',
    html_url: 'https://github.com/ncptunex',
    type: 'User',
    public_repos: 0,
    name: null,
    avatar_url: null,
  };
}
