// Task 4.4: every row of the error table (design 5.9), using constructed fixtures for the
// HTTP cases. Timeout, network, proxy, demo and cancelled have no HTTP response; their
// flags are checked directly.
import { describe, expect, it } from 'vitest';
import { classifyResponse } from '../../src/data/github/errors/classify-response';
import { ERROR_KINDS, makeError, type ErrorKind } from '../../src/data/github/errors/error-kinds';
import { capturedResponse, constructedResponse } from './helpers/fixtures';

describe('makeError flags (design 5.9)', () => {
  const table: Record<ErrorKind, { demoAvailable: boolean; retryable: boolean }> = {
    'invalid-username': { demoAvailable: false, retryable: true },
    'user-not-found': { demoAvailable: false, retryable: true },
    'repo-not-found': { demoAvailable: false, retryable: false },
    'rate-limited': { demoAvailable: true, retryable: true },
    forbidden: { demoAvailable: false, retryable: false },
    timeout: { demoAvailable: true, retryable: true },
    network: { demoAvailable: true, retryable: true },
    'github-unavailable': { demoAvailable: true, retryable: true },
    'proxy-unavailable': { demoAvailable: true, retryable: true },
    'unexpected-response': { demoAvailable: true, retryable: true },
    'demo-unavailable': { demoAvailable: false, retryable: false },
    cancelled: { demoAvailable: false, retryable: false },
  };

  it('covers every error kind', () => {
    expect([...ERROR_KINDS].sort()).toEqual(Object.keys(table).sort());
  });

  it.each(Object.entries(table))('%s has the flags from the table', (kind, flags) => {
    const error = makeError(kind as ErrorKind);
    expect(error.demoAvailable).toBe(flags.demoAvailable);
    expect(error.retryable).toBe(flags.retryable);
    expect(error.messageKey).toBe(`error.${kind}`);
    expect(error.details).toEqual({});
  });

  it('offers the demo exactly for the kinds in Req 8.9 plus unexpected-response', () => {
    const offered = ERROR_KINDS.filter((kind) => makeError(kind).demoAvailable).sort();
    expect(offered).toEqual(
      ['github-unavailable', 'network', 'proxy-unavailable', 'rate-limited', 'timeout', 'unexpected-response'].sort(),
    );
  });
});

describe('classifyResponse', () => {
  it('returns null for a usable success', () => {
    expect(classifyResponse('user', capturedResponse('user.ncptunex.json'))).toBeNull();
  });

  it.each(['rate-limit-primary-403.json', 'rate-limit-primary-429.json'])(
    'maps %s to a primary rate limit with the reset time',
    (file) => {
      const error = classifyResponse('repo', constructedResponse(file));
      expect(error?.kind).toBe('rate-limited');
      expect(error?.details.limitType).toBe('primary');
      expect(error?.details.resetAt).toBe(new Date(1795359600 * 1000).toISOString());
      expect(error?.messageKey).toBe('error.rate-limited.primary');
      expect(error?.demoAvailable).toBe(true);
    },
  );

  it.each([
    ['rate-limit-secondary-403-retry-after.json', 30],
    ['rate-limit-secondary-429-retry-after.json', 45],
  ])('maps %s to a secondary rate limit with the wait time', (file, seconds) => {
    const error = classifyResponse('repo', constructedResponse(file));
    expect(error?.kind).toBe('rate-limited');
    expect(error?.details.limitType).toBe('secondary');
    expect(error?.details.retryAfterSeconds).toBe(seconds);
    expect(error?.messageKey).toBe('error.rate-limited.secondary');
  });

  it('recognises a secondary rate limit by its message when there is no retry-after', () => {
    const error = classifyResponse('repo', constructedResponse('rate-limit-secondary-403-message.json'));
    expect(error?.kind).toBe('rate-limited');
    expect(error?.details.limitType).toBe('secondary');
    expect(error?.details.retryAfterSeconds).toBeNull();
  });

  it('maps a plain 403 to forbidden, never to a rate limit', () => {
    const error = classifyResponse('repo', constructedResponse('forbidden-403.json'));
    expect(error?.kind).toBe('forbidden');
    expect(error?.details.limitType).toBeUndefined();
    expect(error?.demoAvailable).toBe(false);
  });

  it('treats a 429 without limit headers or message as a secondary limit with unknown wait', () => {
    const error = classifyResponse('repo', { status: 429, headers: {}, body: {} });
    expect(error?.kind).toBe('rate-limited');
    expect(error?.details.limitType).toBe('secondary');
    expect(error?.details.retryAfterSeconds).toBeNull();
  });

  it('maps a 404 on an account endpoint to user-not-found', () => {
    const response = constructedResponse('user-not-found-404.json');
    for (const endpoint of ['user', 'user-repos', 'org-repos'] as const) {
      expect(classifyResponse(endpoint, response)?.kind).toBe('user-not-found');
    }
  });

  it('maps a 404 on a repository endpoint to repo-not-found', () => {
    const error = classifyResponse('repo', constructedResponse('repo-not-found-404.json'));
    expect(error?.kind).toBe('repo-not-found');
    expect(error?.demoAvailable).toBe(false);
  });

  it.each(['server-error-500.json', 'server-error-502.json', 'server-error-503.json'])(
    'maps %s to github-unavailable',
    (file) => {
      const error = classifyResponse('repo', constructedResponse(file));
      expect(error?.kind).toBe('github-unavailable');
      expect(error?.retryable).toBe(true);
      expect(error?.demoAvailable).toBe(true);
    },
  );

  it('maps broken JSON to unexpected-response', () => {
    const response = constructedResponse('broken-json.json');
    expect(response.bodyParseFailed).toBe(true);
    expect(classifyResponse('user', response)?.kind).toBe('unexpected-response');
  });

  it('maps other 4xx answers to unexpected-response', () => {
    expect(classifyResponse('repo', { status: 422, headers: {}, body: {} })?.kind).toBe('unexpected-response');
  });
});
