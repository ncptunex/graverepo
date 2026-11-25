// Direct transport tests (task 7.5, design 4.3; Req 1.4, 3.3, 6.7, 12.4, 12.5). No real network.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GITHUB_API_VERSION } from '../../shared/github-endpoints/catalogue';
import {
  createDirectTransport,
  DEFAULT_TIMEOUT_MS,
  readNextPage,
} from '../../src/data/github/transport/direct-transport';
import { toHttpResponse } from '../../src/data/github/transport/types';
import { loadCaptured } from './helpers/fixtures';

const NOW = new Date('2026-11-22T13:00:00.000Z');
const now = () => NOW;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function transportWith(fetchImpl: typeof fetch) {
  return createDirectTransport({ fetchImpl, now });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('direct transport requests', () => {
  it('builds the URL from the catalogue and sends the pinned headers, with no Authorization header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await transportWith(fetchImpl as unknown as typeof fetch).request({
      endpointId: 'repo',
      pathValues: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/octocat/Hello-World');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    });
    expect(JSON.stringify(init.headers).toLowerCase()).not.toContain('authorization');
    expect(init.credentials).toBe('omit');
  });

  it('refuses anything outside the catalogue without sending a request', async () => {
    const fetchImpl = vi.fn();
    const transport = transportWith(fetchImpl as unknown as typeof fetch);
    const badQuery = await transport.request({
      endpointId: 'repo',
      pathValues: { owner: 'octocat', repo: 'x' },
      query: { token: 'abc' },
    });
    const badOwner = await transport.request({ endpointId: 'user', pathValues: { owner: '../etc' } });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(badQuery.transportFailure).toBe('network');
    expect(badOwner.transportFailure).toBe('network');
  });

  it('returns the status, parsed body and fetch time of a successful answer', async () => {
    const fixture = loadCaptured('user.ncptunex.json');
    const transport = transportWith((async () => jsonResponse(fixture.body)) as unknown as typeof fetch);
    const raw = await transport.request({ endpointId: 'user', pathValues: { owner: 'ncptunex' } });
    expect(raw.status).toBe(200);
    expect(raw.data).toEqual(fixture.body);
    expect(raw.dataParseFailed).toBe(false);
    expect(raw.fetchedAt).toBe(NOW.toISOString());
    expect(raw.transportFailure).toBeNull();
    expect(raw.rateLimit.route).toBe('direct');
    expect(raw.rateLimit.tokenUsed).toBe(false);
  });

  it('keeps an error status and its body for the error mapping', async () => {
    const transport = transportWith((async () => jsonResponse({ message: 'Not Found' }, 404)) as unknown as typeof fetch);
    const raw = await transport.request({ endpointId: 'user', pathValues: { owner: 'nobody-here' } });
    expect(raw.status).toBe(404);
    expect(raw.data).toEqual({ message: 'Not Found' });
    expect(raw.transportFailure).toBeNull();
  });

  it('marks a body that is not JSON instead of throwing', async () => {
    const transport = transportWith((async () => new Response('<html>oops</html>', { status: 200 })) as unknown as typeof fetch);
    const raw = await transport.request({ endpointId: 'user', pathValues: { owner: 'octocat' } });
    expect(raw.dataParseFailed).toBe(true);
    expect(toHttpResponse(raw).bodyParseFailed).toBe(true);
  });
});

describe('rate-limit headers and pagination', () => {
  it('reads limit, remaining, reset time and retry-after', async () => {
    const transport = transportWith(
      (async () =>
        jsonResponse({ message: 'x' }, 429, {
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '41',
          'x-ratelimit-reset': '1795359600',
          'retry-after': '45',
        })) as unknown as typeof fetch,
    );
    const raw = await transport.request({ endpointId: 'user', pathValues: { owner: 'octocat' } });
    expect(raw.rateLimit).toEqual({
      route: 'direct',
      limit: 60,
      remaining: 41,
      resetAt: new Date(1795359600 * 1000).toISOString(),
      retryAfterSeconds: 45,
      tokenUsed: false,
    });
  });

  it('reports unknown values as null, never 0', async () => {
    const transport = transportWith((async () => jsonResponse({})) as unknown as typeof fetch);
    const raw = await transport.request({ endpointId: 'user', pathValues: { owner: 'octocat' } });
    expect(raw.rateLimit.limit).toBeNull();
    expect(raw.rateLimit.remaining).toBeNull();
    expect(raw.rateLimit.resetAt).toBeNull();
    expect(raw.rateLimit.retryAfterSeconds).toBeNull();
  });

  it('reads nextPage from the Link header of a captured fixture', () => {
    const fixture = loadCaptured('user-repos.ncptunex.json');
    // The captured list has no Link header, so there is no next page.
    expect(readNextPage(fixture.headers?.link ?? null)).toBeNull();
  });

  it.each([
    ['<https://api.github.com/user/repos?per_page=100&page=2>; rel="next", <https://api.github.com/user/repos?per_page=100&page=3>; rel="last"', 2],
    ['<https://api.github.com/user/repos?page=3>; rel="prev", <https://api.github.com/user/repos?page=5>; rel="next"', 5],
    ['<https://api.github.com/user/repos?page=3>; rel="prev"', null],
    ['<not a url>; rel="next"', null],
    ['<https://api.github.com/x?page=abc>; rel="next"', null],
    ['', null],
  ])('reads the next page from %s', (header, expected) => {
    expect(readNextPage(header)).toBe(expected);
  });

  it('returns nextPage from the response headers', async () => {
    const transport = transportWith(
      (async () =>
        jsonResponse([], 200, {
          link: '<https://api.github.com/users/octocat/repos?type=owner&page=2>; rel="next"',
        })) as unknown as typeof fetch,
    );
    const raw = await transport.request({ endpointId: 'user-repos', pathValues: { owner: 'octocat' } });
    expect(raw.nextPage).toBe(2);
  });
});

describe('transport failures', () => {
  it('marks a network failure', async () => {
    const transport = transportWith((async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch);
    const raw = await transport.request({ endpointId: 'user', pathValues: { owner: 'octocat' } });
    expect(raw.transportFailure).toBe('network');
    expect(raw.status).toBe(0);
  });

  it('marks a timeout after 10 seconds', async () => {
    vi.useFakeTimers();
    const hangs = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const pending = transportWith(hangs).request({ endpointId: 'user', pathValues: { owner: 'octocat' } });

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const raw = await pending;
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
    expect(raw.transportFailure).toBe('timeout');
  });

  it('marks a cancelled request', async () => {
    const controller = new AbortController();
    const hangs = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const pending = transportWith(hangs).request({
      endpointId: 'user',
      pathValues: { owner: 'octocat' },
      signal: controller.signal,
    });
    controller.abort();
    expect((await pending).transportFailure).toBe('cancelled');
  });

  it('does not send a request that was cancelled before it started', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const raw = await transportWith(fetchImpl as unknown as typeof fetch).request({
      endpointId: 'user',
      pathValues: { owner: 'octocat' },
      signal: controller.signal,
    });
    expect(raw.transportFailure).toBe('cancelled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
