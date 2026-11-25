// The Phase 1 direct transport (task 7.2, design 4.3; Req 1.4, 3.3, 6.7, 12.5).
// The browser calls GitHub directly. It sends the pinned headers and never an Authorization
// header or cookies. Redirects for renamed repositories are followed by the browser.
import { buildGitHubUrl } from '../../../../shared/github-endpoints/build-url';
import { GITHUB_ACCEPT_HEADER, GITHUB_API_VERSION } from '../../../../shared/github-endpoints/catalogue';
import type { RawRateLimit, RawResponse, Transport, TransportFailure, TransportRequest } from './types';

export const DEFAULT_TIMEOUT_MS = 10_000;

export type DirectTransportOptions = {
  /** Defaults to the global `fetch`. Tests pass a fake. */
  readonly fetchImpl?: typeof fetch;
  /** Defaults to the real clock. */
  readonly now?: () => Date;
};

function readWholeNumber(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/** `x-ratelimit-reset` is a Unix time in seconds. */
function readResetAt(value: string | null): string | null {
  const seconds = readWholeNumber(value);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

export function readRateLimit(headers: Pick<Headers, 'get'>): RawRateLimit {
  return {
    route: 'direct',
    limit: readWholeNumber(headers.get('x-ratelimit-limit')),
    remaining: readWholeNumber(headers.get('x-ratelimit-remaining')),
    resetAt: readResetAt(headers.get('x-ratelimit-reset')),
    retryAfterSeconds: readWholeNumber(headers.get('retry-after')),
    tokenUsed: false,
  };
}

/**
 * Reads the next page number from a `Link` header, for example
 * `<https://api.github.com/user/repos?page=2>; rel="next", <...>; rel="last"`.
 * Returns null when there is no `next` link or its page number is not a whole number.
 */
export function readNextPage(linkHeader: string | null): number | null {
  if (linkHeader === null) return null;
  for (const part of linkHeader.split(',')) {
    const match = /<([^>]*)>\s*;\s*rel="?next"?/i.exec(part);
    if (!match) continue;
    try {
      const page = new URL(match[1] ?? '').searchParams.get('page');
      return page !== null && /^\d+$/.test(page) ? Number(page) : null;
    } catch {
      return null;
    }
  }
  return null;
}

const NO_RATE_LIMIT: RawRateLimit = {
  route: 'direct',
  limit: null,
  remaining: null,
  resetAt: null,
  retryAfterSeconds: null,
  tokenUsed: false,
};

export function createDirectTransport(options: DirectTransportOptions = {}): Transport {
  const now = options.now ?? (() => new Date());

  function failure(kind: TransportFailure): RawResponse {
    return {
      status: 0,
      data: null,
      dataParseFailed: false,
      fetchedAt: now().toISOString(),
      rateLimit: NO_RATE_LIMIT,
      nextPage: null,
      transportFailure: kind,
    };
  }

  return {
    route: 'direct',
    async request(request: TransportRequest): Promise<RawResponse> {
      const built = buildGitHubUrl(request.endpointId, request.pathValues, request.query);
      // Nothing outside the catalogue is ever sent (Req 12.1).
      if (!built.ok) return failure('network');
      if (request.signal?.aborted) return failure('cancelled');

      const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const signals = [timeoutController.signal, ...(request.signal ? [request.signal] : [])];
      const signal = signals.length === 1 ? timeoutController.signal : AbortSignal.any(signals);

      try {
        const response = await fetchImpl(built.url, {
          method: 'GET',
          headers: {
            Accept: GITHUB_ACCEPT_HEADER,
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
          },
          // No cookies and no Authorization header are ever sent.
          credentials: 'omit',
          signal,
        });
        const fetchedAt = now().toISOString();

        let data: unknown = null;
        let dataParseFailed = false;
        try {
          data = JSON.parse(await response.text());
        } catch {
          dataParseFailed = true;
        }
        return {
          status: response.status,
          data,
          dataParseFailed,
          fetchedAt,
          rateLimit: readRateLimit(response.headers),
          nextPage: readNextPage(response.headers.get('link')),
          transportFailure: null,
        };
      } catch {
        if (request.signal?.aborted) return failure('cancelled');
        if (timeoutController.signal.aborted) return failure('timeout');
        return failure('network');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
