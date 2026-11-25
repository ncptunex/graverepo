// Tests for `lookupUser` (task 9.1; Req 1, 7.2, 7.3, 9.7, 12.3).
import { describe, expect, it } from 'vitest';
import { capturedResponse, constructedResponse } from './helpers/fixtures';
import { createTestLayer, rawFrom, transportFailure, START } from './helpers/fake-layer';

const MINUTE = 60_000;

function profileHandler() {
  return () => rawFrom(capturedResponse('user.ncptunex.json'));
}

describe('lookupUser', () => {
  it('trims the name, requests the profile and returns a user profile from a captured response', async () => {
    const { layer, transport } = createTestLayer(profileHandler());
    const result = await layer.lookupUser('  ncptunex  ');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ login: 'ncptunex', accountType: 'user', publicRepoCount: 9 });
    expect(result.provenance).toEqual({
      source: 'live',
      route: 'direct',
      fetchedAt: START.toISOString(),
      stale: false,
    });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toMatchObject({ endpointId: 'user', pathValues: { owner: 'ncptunex' } });
  });

  it('reports an organisation as account type organisation', async () => {
    const { layer } = createTestLayer(() => rawFrom(capturedResponse('user.vitest-dev.json')));
    const result = await layer.lookupUser('vitest-dev');
    expect(result.ok && result.data.accountType).toBe('organisation');
  });

  it.each(['', '   ', '-leading', 'has space', 'under_score', 'a'.repeat(40)])(
    'returns invalid-username without a request for %j',
    async (name) => {
      const { layer, transport } = createTestLayer(profileHandler());
      const result = await layer.lookupUser(name);
      expect(!result.ok && result.error.kind).toBe('invalid-username');
      expect(transport.calls).toHaveLength(0);
    },
  );

  it('returns user-not-found with the searched name', async () => {
    const { layer } = createTestLayer(() => rawFrom(constructedResponse('user-not-found-404.json')));
    const result = await layer.lookupUser('nobody-here');
    expect(!result.ok && result.error).toMatchObject({
      kind: 'user-not-found',
      details: { username: 'nobody-here' },
      demoAvailable: false,
    });
  });

  it('returns typed errors for a timeout, a network failure and a server error', async () => {
    const timeout = createTestLayer(() => transportFailure('timeout'));
    expect((await timeout.layer.lookupUser('ncptunex')).ok).toBe(false);
    const result = await timeout.layer.lookupUser('ncptunex');
    expect(!result.ok && result.error).toMatchObject({ kind: 'timeout', demoAvailable: true });

    const network = createTestLayer(() => transportFailure('network'));
    const networkResult = await network.layer.lookupUser('ncptunex');
    expect(!networkResult.ok && networkResult.error.kind).toBe('network');

    const server = createTestLayer(() => rawFrom(constructedResponse('server-error-500.json')));
    const serverResult = await server.layer.lookupUser('ncptunex');
    expect(!serverResult.ok && serverResult.error.kind).toBe('github-unavailable');
  });

  it('returns unexpected-response for a profile that fails its schema', async () => {
    const { layer } = createTestLayer(() => rawFrom(constructedResponse('user-missing-login.json')));
    const result = await layer.lookupUser('ncptunex');
    expect(!result.ok && result.error.kind).toBe('unexpected-response');
  });

  it('returns a primary rate limit with the reset time, and then sends nothing more', async () => {
    const { layer, transport } = createTestLayer(() => rawFrom(constructedResponse('rate-limit-primary-403.json')));
    const first = await layer.lookupUser('ncptunex');
    expect(!first.ok && first.error).toMatchObject({ kind: 'rate-limited', details: { limitType: 'primary' } });

    const second = await layer.lookupUser('someone-else');
    expect(!second.ok && second.error.kind).toBe('rate-limited');
    // The second lookup was refused before any request (Req 9.7), and nothing was retried (Req 9.8).
    expect(transport.calls).toHaveLength(1);
    expect(second.rateLimit.blockedUntil).not.toBeNull();
  });

  it('serves a fresh profile from the cache with no request, using the lowercased login', async () => {
    const { layer, transport, advance } = createTestLayer(profileHandler());
    await layer.lookupUser('ncptunex');
    advance(5 * MINUTE);
    const again = await layer.lookupUser('NCPTUNEX');

    expect(again.ok && again.provenance).toMatchObject({ source: 'cache', stale: false });
    expect(transport.calls).toHaveLength(1);
  });

  it('refreshes a stale profile, and skips the cache on forceRefresh', async () => {
    const { layer, transport, advance } = createTestLayer(profileHandler());
    await layer.lookupUser('ncptunex');
    advance(11 * MINUTE);
    const refreshed = await layer.lookupUser('ncptunex');
    expect(refreshed.ok && refreshed.provenance.source).toBe('live');
    expect(transport.calls).toHaveLength(2);

    const forced = await layer.lookupUser('ncptunex', { forceRefresh: true });
    expect(forced.ok && forced.provenance.source).toBe('live');
    expect(transport.calls).toHaveLength(3);
  });

  it('serves a stale profile with the refresh error when the refresh fails', async () => {
    let failNow = false;
    const { layer, advance } = createTestLayer(() =>
      failNow ? transportFailure('network') : rawFrom(capturedResponse('user.ncptunex.json')),
    );
    await layer.lookupUser('ncptunex');
    advance(11 * MINUTE);
    failNow = true;
    const result = await layer.lookupUser('ncptunex');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance).toMatchObject({ source: 'cache', stale: true });
    expect(result.refreshError?.kind).toBe('network');
  });

  describe('cancellation', () => {
    it('gives the earlier caller `cancelled` when a newer lookup starts, and the newer caller its data', async () => {
      const { layer } = createTestLayer(profileHandler());
      const first = layer.lookupUser('ncptunex');
      const second = layer.lookupUser('vitest-dev');

      const firstResult = await first;
      const secondResult = await second;
      expect(!firstResult.ok && firstResult.error.kind).toBe('cancelled');
      expect(secondResult.ok).toBe(true);
    });

    it('returns `cancelled` when the caller aborts, without stopping the shared request', async () => {
      const { layer, transport } = createTestLayer(profileHandler());
      const controller = new AbortController();
      const cancelled = layer.lookupUser('ncptunex', { signal: controller.signal });
      controller.abort();
      const result = await cancelled;
      expect(!result.ok && result.error.kind).toBe('cancelled');

      // The request that was already sent still completed and filled the cache.
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(transport.calls).toHaveLength(1);
      const later = await layer.lookupUser('ncptunex');
      expect(later.ok && later.provenance.source).toBe('cache');
    });

    it('does not send a request when the signal is already aborted', async () => {
      const { layer, transport } = createTestLayer(profileHandler());
      const controller = new AbortController();
      controller.abort();
      const result = await layer.lookupUser('ncptunex', { signal: controller.signal });
      expect(!result.ok && result.error.kind).toBe('cancelled');
      expect(transport.calls).toHaveLength(0);
    });
  });

  it('refuses live requests in demo-only mode, and offers the demo', async () => {
    const { layer, transport } = createTestLayer(profileHandler(), { mode: 'demo-only' });
    const result = await layer.lookupUser('ncptunex');
    expect(!result.ok && result.error).toMatchObject({ kind: 'network', demoAvailable: true });
    expect(transport.calls).toHaveLength(0);
  });
});
