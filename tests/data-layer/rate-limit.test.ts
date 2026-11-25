// Rate-limit tracker and route selector tests (task 7.5, design 8.7; Req 8.16, 9.1–9.4, 9.7, 9.8, 9.12).
// Constructed fixtures supply the 403 and 429 answers (they cannot be captured on demand).
import { describe, expect, it, vi } from 'vitest';
import { createRateLimitTracker } from '../../src/data/github/rate-limit';
import { createRouteSelector, transportFailureToError } from '../../src/data/github/route-selector';
import { readRateLimit } from '../../src/data/github/transport/direct-transport';
import type { RawResponse, Transport } from '../../src/data/github/transport/types';
import { constructedResponse } from './helpers/fixtures';

const RESET_MS = 1795359600 * 1000;
const BEFORE_RESET = new Date(RESET_MS - 10 * 60 * 1000);
const AFTER_RESET = new Date(RESET_MS + 1000);

/** Turns a fixture into the raw response a transport would return. */
function rawFrom(fixtureName: string): RawResponse {
  const response = constructedResponse(fixtureName);
  return {
    status: response.status,
    data: response.body,
    dataParseFailed: response.bodyParseFailed ?? false,
    fetchedAt: BEFORE_RESET.toISOString(),
    rateLimit: readRateLimit({ get: (name: string) => response.headers[name] ?? null }),
    nextPage: null,
    transportFailure: null,
  };
}

function okRaw(remaining: number, limit = 60): RawResponse {
  return {
    status: 200,
    data: {},
    dataParseFailed: false,
    fetchedAt: BEFORE_RESET.toISOString(),
    rateLimit: {
      route: 'direct',
      limit,
      remaining,
      resetAt: new Date(RESET_MS).toISOString(),
      retryAfterSeconds: null,
      tokenUsed: false,
    },
    nextPage: null,
    transportFailure: null,
  };
}

describe('rate-limit tracker', () => {
  it('reports every value as unknown before the first response (Req 9.12)', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    expect(tracker.status('direct')).toEqual({
      route: 'direct',
      limit: null,
      remaining: null,
      resetAt: null,
      tokenUsed: false,
      blockedUntil: null,
    });
    expect(tracker.budget('direct')).toEqual({ remaining: null, resetAt: null });
  });

  it('records limit, remaining and reset time from each response (Req 9.1)', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    tracker.observe('user', okRaw(58));
    expect(tracker.status('direct')).toMatchObject({
      limit: 60,
      remaining: 58,
      resetAt: new Date(RESET_MS).toISOString(),
      blockedUntil: null,
    });
    tracker.observe('user', okRaw(57));
    expect(tracker.budget('direct').remaining).toBe(57);
  });

  it('keeps the last known values when a request fails before any answer', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    tracker.observe('user', okRaw(30));
    tracker.observe('user', { ...okRaw(0), status: 0, transportFailure: 'network', rateLimit: { ...okRaw(0).rateLimit, remaining: null } });
    expect(tracker.budget('direct').remaining).toBe(30);
  });

  it('treats the budget as unknown again once the reset time has passed', () => {
    let clock = BEFORE_RESET;
    const tracker = createRateLimitTracker(() => clock);
    tracker.observe('user', okRaw(3));
    expect(tracker.budget('direct').remaining).toBe(3);
    clock = AFTER_RESET;
    expect(tracker.budget('direct').remaining).toBeNull();
  });

  it('classifies a primary limit, returns the error with its reset time, and blocks the route', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    const error = tracker.observe('user', rawFrom('rate-limit-primary-403.json'));
    expect(error).toMatchObject({
      kind: 'rate-limited',
      details: { limitType: 'primary', resetAt: new Date(RESET_MS).toISOString() },
    });
    expect(tracker.status('direct').blockedUntil).toBe(new Date(RESET_MS).toISOString());
    expect(tracker.blockedError('direct')).toMatchObject({ kind: 'rate-limited', details: { limitType: 'primary' } });
  });

  it('also treats a 429 with no requests left as a primary limit', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    expect(tracker.observe('user', rawFrom('rate-limit-primary-429.json'))).toMatchObject({
      details: { limitType: 'primary' },
    });
  });

  it('lifts the block at the reset time', () => {
    let clock = BEFORE_RESET;
    const tracker = createRateLimitTracker(() => clock);
    tracker.observe('user', rawFrom('rate-limit-primary-403.json'));
    expect(tracker.blockedError('direct')).not.toBeNull();
    clock = AFTER_RESET;
    expect(tracker.blockedError('direct')).toBeNull();
    expect(tracker.status('direct').blockedUntil).toBeNull();
  });

  it('does not block the route for a secondary limit, and reports the wait', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    const error = tracker.observe('user', rawFrom('rate-limit-secondary-429-retry-after.json'));
    expect(error).toMatchObject({ kind: 'rate-limited', details: { limitType: 'secondary', retryAfterSeconds: 45 } });
    expect(tracker.blockedError('direct')).toBeNull();
  });

  it('does not block the route, and does not call it a rate limit, for a plain 403', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    const error = tracker.observe('repo', rawFrom('forbidden-403.json'));
    expect(error?.kind).toBe('forbidden');
    expect(tracker.blockedError('direct')).toBeNull();
  });

  it('returns no error for a normal answer', () => {
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    expect(tracker.observe('user', okRaw(10))).toBeNull();
  });
});

describe('route selector', () => {
  function fakeTransport() {
    const request = vi.fn();
    const transport: Transport = { route: 'direct', request };
    return { transport, request };
  }

  it('makes no request and no rate-limit check when created (Req 8.16)', () => {
    const { transport, request } = fakeTransport();
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    const status = vi.spyOn(tracker, 'status');
    createRouteSelector({ mode: 'direct', direct: transport, tracker });
    expect(request).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('chooses direct mode normally', () => {
    const { transport } = fakeTransport();
    const selector = createRouteSelector({ mode: 'direct', direct: transport, tracker: createRateLimitTracker(() => BEFORE_RESET) });
    expect(selector.select()).toEqual({ ok: true, route: 'direct', transport });
  });

  it('refuses a route blocked by a primary limit, with the reset time, until it resets', () => {
    let clock = BEFORE_RESET;
    const { transport, request } = fakeTransport();
    const tracker = createRateLimitTracker(() => clock);
    tracker.observe('user', rawFrom('rate-limit-primary-403.json'));
    const selector = createRouteSelector({ mode: 'direct', direct: transport, tracker });

    const refused = selector.select();
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toMatchObject({ kind: 'rate-limited', demoAvailable: true });
      expect(refused.error.details.resetAt).toBe(new Date(RESET_MS).toISOString());
    }
    expect(request).not.toHaveBeenCalled();

    clock = AFTER_RESET;
    expect(selector.select().ok).toBe(true);
  });

  it('does not retry a rate-limited request by itself (Req 9.8)', async () => {
    const request = vi.fn(async () => rawFrom('rate-limit-primary-403.json'));
    const transport: Transport = { route: 'direct', request };
    const tracker = createRateLimitTracker(() => BEFORE_RESET);
    const selector = createRouteSelector({ mode: 'direct', direct: transport, tracker });

    const choice = selector.select();
    if (!choice.ok) throw new Error('route should be open');
    const raw = await choice.transport.request({ endpointId: 'user', pathValues: { owner: 'octocat' } });
    tracker.observe('user', raw);
    // Nothing else happens on its own, and the route now refuses new requests.
    expect(request).toHaveBeenCalledTimes(1);
    expect(selector.select().ok).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('supports demo-only mode: live requests are off and the demo is offered', () => {
    const { transport, request } = fakeTransport();
    const selector = createRouteSelector({
      mode: 'demo-only',
      direct: transport,
      tracker: createRateLimitTracker(() => BEFORE_RESET),
    });
    const choice = selector.select();
    expect(choice.ok).toBe(false);
    if (!choice.ok) expect(choice.error).toMatchObject({ kind: 'network', demoAvailable: true });
    expect(request).not.toHaveBeenCalled();
  });
});

describe('transportFailureToError', () => {
  it('maps each failure to its error kind', () => {
    expect(transportFailureToError('network').kind).toBe('network');
    expect(transportFailureToError('timeout').kind).toBe('timeout');
    expect(transportFailureToError('cancelled').kind).toBe('cancelled');
  });
});
