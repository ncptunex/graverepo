// Tests for `estimateDetailRequests`, the three-step detail runner and `getRepositoryDetail`
// (tasks 9.4–9.6 and 9.8; design 3.5, 8.4 and 8.9; Req 4, 6.3, 6.10, 6.11, 9.10–9.15, 10.2).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDirectTransport } from '../../src/data/github/transport/direct-transport';
import { adaptRepository } from '../../src/data/github/adapters/repository';
import { maxDetailRequests } from '../../src/data/github/detail-estimate';
import type { RepositorySummary } from '../../src/data/github/types';
import { SECTION_SWITCHES } from '../../shared/github-endpoints/catalogue';
import { capturedResponse, constructedResponse, loadCaptured } from './helpers/fixtures';
import {
  START,
  WINDOW_START,
  createTestLayer,
  detailHandler,
  rawFrom,
  requestKey,
  transportFailure,
} from './helpers/fake-layer';
import { createGitHubDataLayer } from '../../src/data/github/data-layer';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const keys = (calls: { endpointId: string }[]) => calls.map((call) => call.endpointId);

function coreSummary(fixture = 'repo.dubzzz.fast-check.json'): RepositorySummary {
  const result = adaptRepository(loadCaptured(fixture).body);
  if (!result.ok) throw new Error('fixture should convert');
  return result.value;
}

describe('getRepositoryDetail: request order and counts', () => {
  it('requests core first, the independent sections next, and the dependent sections last (9 requests)', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = transport.calls.map(requestKey);
    expect(order[0]).toBe('repo');
    // Step 2 holds the six independent requests, step 3 the two dependent ones.
    expect(new Set(order.slice(1, 7))).toEqual(
      new Set(['readme', 'commits:latest', 'issues', 'branches', 'workflow-runs', 'root-contents']),
    );
    expect(new Set(order.slice(7))).toEqual(new Set(['commits:since', 'commits:path']));
    expect(transport.calls).toHaveLength(9);

    const { sections, core, isEmpty, renamedFrom } = result.data;
    expect(core.fullName).toBe('dubzzz/fast-check');
    expect(isEmpty).toBe(false);
    expect(renamedFrom).toBeNull();
    for (const section of Object.values(sections)) expect(section.status).toBe('available');
  });

  it('never runs more than 4 requests at the same time', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(transport.maxConcurrent()).toBeGreaterThan(1);
    expect(transport.maxConcurrent()).toBeLessThanOrEqual(4);
  });

  it('attaches one provenance to the whole detail', async () => {
    const { layer } = createTestLayer(detailHandler());
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok && result.provenance).toEqual({
      source: 'live',
      route: 'direct',
      fetchedAt: START.toISOString(),
      stale: false,
    });
  });

  it('returns the core error after one request when the repository is not found', async () => {
    const { layer, transport } = createTestLayer(() => rawFrom(constructedResponse('repo-not-found-404.json')));
    const result = await layer.getRepositoryDetail('dubzzz', 'missing');
    expect(!result.ok && result.error).toMatchObject({
      kind: 'repo-not-found',
      details: { repository: 'dubzzz/missing' },
      demoAvailable: false,
    });
    expect(transport.calls).toHaveLength(1);
  });

  it.each([
    ['a primary rate limit', 'rate-limit-primary-403.json', 'rate-limited'],
    ['a plain 403', 'forbidden-403.json', 'forbidden'],
    ['a server error', 'server-error-503.json', 'github-unavailable'],
    ['broken JSON', 'broken-json.json', 'unexpected-response'],
  ])('returns the core error after one request for %s', async (_name, fixture, kind) => {
    const { layer, transport } = createTestLayer(() => rawFrom(constructedResponse(fixture)));
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(!result.ok && result.error.kind).toBe(kind);
    expect(transport.calls).toHaveLength(1);
  });

  it('returns timeout and network failures of the core request as errors', async () => {
    for (const kind of ['timeout', 'network'] as const) {
      const { layer, transport } = createTestLayer(() => transportFailure(kind));
      const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
      expect(!result.ok && result.error.kind).toBe(kind);
      expect(transport.calls).toHaveLength(1);
    }
  });

  it('rejects names that cannot exist without a request', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    const badOwner = await layer.getRepositoryDetail('bad owner', 'fast-check');
    const badRepo = await layer.getRepositoryDetail('dubzzz', '..');
    expect(!badOwner.ok && badOwner.error.kind).toBe('invalid-username');
    expect(!badRepo.ok && badRepo.error.kind).toBe('repo-not-found');
    expect(transport.calls).toHaveLength(0);
  });
});

describe('getRepositoryDetail: sections and skip rules', () => {
  it('keeps the other sections when one section fails, and does not cache the incomplete detail', async () => {
    const { layer, transport } = createTestLayer(detailHandler({ branches: transportFailure('network') }));
    const first = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.sections.branches).toEqual({ status: 'unavailable', reason: 'network' });
    expect(first.data.sections.readme.status).toBe('available');
    expect(first.data.sections.openIssues.status).toBe('available');

    const callsBefore = transport.calls.length;
    await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(transport.calls.length).toBeGreaterThan(callsBefore);
  });

  it('reports a failed latest commit as unavailable for recent authors too, and skips the request', async () => {
    const { layer, transport } = createTestLayer(detailHandler({ 'commits:latest': transportFailure('timeout') }));
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sections.latestCommit).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(result.data.sections.recentAuthors).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(transport.calls.map(requestKey)).not.toContain('commits:since');
  });

  it('does not request issues when core says they are turned off', async () => {
    const { layer, transport } = createTestLayer(
      detailHandler({ repo: capturedResponse('repo.ncptunex.devops-micro-internship-pravinmishra.json') }),
    );
    const result = await layer.getRepositoryDetail('ncptunex', 'devops-micro-internship-pravinmishra');
    expect(result.ok && result.data.sections.openIssues).toEqual({ status: 'not-applicable', reason: 'issues-disabled' });
    expect(keys(transport.calls)).not.toContain('issues');
  });

  it('reports zero recent authors without a request when the latest commit is outside the window', async () => {
    const { layer, transport, advance } = createTestLayer(detailHandler());
    advance(400 * DAY);
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok && result.data.sections.recentAuthors).toMatchObject({
      status: 'available',
      value: { authorCount: 0, commitsRead: 0 },
    });
    expect(transport.calls.map(requestKey)).not.toContain('commits:since');
    expect(transport.calls).toHaveLength(8);
  });

  it('reports no manifest without a request when the root folder has none', async () => {
    const { layer, transport } = createTestLayer(
      detailHandler({
        'root-contents': () =>
          rawFrom({ status: 200, headers: {}, body: [{ name: 'README.md', path: 'README.md', type: 'file' }] }),
      }),
    );
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok && result.data.sections.manifest).toMatchObject({
      status: 'available',
      value: { fileName: null },
    });
    expect(transport.calls.map(requestKey)).not.toContain('commits:path');
    expect(transport.calls).toHaveLength(8);
  });

  it('marks an empty repository, with commit-based and manifest sections not applicable (7 requests)', async () => {
    const { layer, transport } = createTestLayer(
      detailHandler({
        'commits:latest': constructedResponse('empty-repo-commits-409.json'),
        'root-contents': constructedResponse('empty-repo-contents-404.json'),
      }),
    );
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notApplicable = { status: 'not-applicable', reason: 'empty-repository' };
    expect(result.data.isEmpty).toBe(true);
    expect(result.data.sections.latestCommit).toEqual(notApplicable);
    expect(result.data.sections.recentAuthors).toEqual(notApplicable);
    expect(result.data.sections.manifest).toEqual(notApplicable);
    expect(transport.calls).toHaveLength(7);
  });

  it('treats a missing README and no workflow runs as facts, not errors', async () => {
    const { layer } = createTestLayer(
      detailHandler({
        readme: capturedResponse('readme.ncptunex.Kiroween-2026-GRAVEREPO.json'),
        'workflow-runs': constructedResponse('workflow-runs-not-found-404.json'),
      }),
    );
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok && result.data.sections.readme).toMatchObject({ status: 'available', value: { found: false } });
    expect(result.ok && result.data.sections.ci).toMatchObject({ status: 'available', value: { found: false } });
  });

  it('uses the official name for later requests and reports renamedFrom', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    const result = await layer.getRepositoryDetail('dubzzz', 'Old-Name');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.core.fullName).toBe('dubzzz/fast-check');
    expect(result.data.renamedFrom).toBe('dubzzz/Old-Name');
    expect(transport.calls[0]?.pathValues).toEqual({ owner: 'dubzzz', repo: 'Old-Name' });
    for (const call of transport.calls.slice(1)) expect(call.pathValues).toEqual({ owner: 'dubzzz', repo: 'fast-check' });

    // The official name finds the same data in the cache, without `renamedFrom`.
    const callsBefore = transport.calls.length;
    const byOfficialName = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(byOfficialName.ok && byOfficialName.provenance.source).toBe('cache');
    expect(byOfficialName.ok && byOfficialName.data.renamedFrom).toBeNull();
    expect(transport.calls).toHaveLength(callsBefore);
  });

  it('does not set renamedFrom when only the letter case differs', async () => {
    const { layer } = createTestLayer(detailHandler());
    const result = await layer.getRepositoryDetail('DubZZZ', 'FAST-CHECK');
    expect(result.ok && result.data.renamedFrom).toBeNull();
  });
});

describe('getRepositoryDetail: section switches (D26)', () => {
  it('sends no request for switched-off sections and reports them as section-disabled', async () => {
    const { layer, transport } = createTestLayer(detailHandler(), {
      switches: { manifest: false, branches: false, ci: false, recentAuthors: false },
    });
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const disabled = { status: 'not-applicable', reason: 'section-disabled' };
    expect(result.data.sections.manifest).toEqual(disabled);
    expect(result.data.sections.branches).toEqual(disabled);
    expect(result.data.sections.ci).toEqual(disabled);
    expect(result.data.sections.recentAuthors).toEqual(disabled);
    expect(keys(transport.calls)).toEqual(expect.arrayContaining(['repo', 'readme', 'commits', 'issues']));
    expect(transport.calls).toHaveLength(4);
  });

  it('keeps the core sections on with every switch off', async () => {
    const { layer } = createTestLayer(detailHandler(), {
      switches: { manifest: false, branches: false, ci: false, recentAuthors: false },
    });
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok && result.data.sections.readme.status).toBe('available');
    expect(result.ok && result.data.sections.latestCommit.status).toBe('available');
    expect(result.ok && result.data.sections.openIssues.status).toBe('available');
  });
});

describe('getRepositoryDetail: caching', () => {
  it('serves a fresh detail from the cache with no request, then refreshes after 30 minutes', async () => {
    const { layer, transport, advance } = createTestLayer(detailHandler());
    await layer.getRepositoryDetail('dubzzz', 'fast-check');
    advance(29 * MINUTE);
    const cached = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(cached.ok && cached.provenance).toMatchObject({ source: 'cache', stale: false });
    expect(transport.calls).toHaveLength(9);

    advance(2 * MINUTE);
    const refreshed = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(refreshed.ok && refreshed.provenance.source).toBe('live');
    expect(transport.calls).toHaveLength(18);
  });

  it('skips the cache on forceRefresh', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    await layer.getRepositoryDetail('dubzzz', 'fast-check');
    await layer.getRepositoryDetail('dubzzz', 'fast-check', { forceRefresh: true });
    expect(transport.calls).toHaveLength(18);
  });

  it('serves the stale detail with the refresh error when the refresh fails', async () => {
    let offline = false;
    const base = detailHandler();
    const { layer, advance } = createTestLayer((request, number) =>
      offline ? transportFailure('network') : base(request, number),
    );
    await layer.getRepositoryDetail('dubzzz', 'fast-check');
    advance(31 * MINUTE);
    offline = true;
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance).toMatchObject({ source: 'cache', stale: true });
    expect(result.refreshError?.kind).toBe('network');
  });

  it('shares one set of requests between two identical concurrent calls', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    const [first, second] = await Promise.all([
      layer.getRepositoryDetail('dubzzz', 'fast-check'),
      layer.getRepositoryDetail('dubzzz', 'fast-check'),
    ]);
    expect(first.ok && second.ok).toBe(true);
    expect(transport.calls).toHaveLength(9);
  });

  it('returns cancelled to a caller that aborts, and still completes the shared work', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    const controller = new AbortController();
    const pending = layer.getRepositoryDetail('dubzzz', 'fast-check', { signal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(!result.ok && result.error.kind).toBe('cancelled');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(transport.calls).toHaveLength(9);
    const later = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(later.ok && later.provenance.source).toBe('cache');
  });
});

describe('estimateDetailRequests and the budget (D27)', () => {
  const summary = coreSummary();

  it('estimates 9 for an active repository with every section on', () => {
    const { layer } = createTestLayer(detailHandler());
    expect(layer.estimateDetailRequests(summary)).toEqual({
      requests: 9,
      budget: null,
      resetAt: null,
      mayNotComplete: false,
    });
  });

  it('is 0 when a fresh cached copy exists, and not 0 after it goes stale or on forceRefresh', async () => {
    const { layer, advance } = createTestLayer(detailHandler());
    await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(layer.estimateDetailRequests(summary).requests).toBe(0);
    expect(layer.estimateDetailRequests(summary, { forceRefresh: true }).requests).toBe(9);
    advance(31 * MINUTE);
    expect(layer.estimateDetailRequests(summary).requests).toBe(9);
  });

  it('drops when issues are turned off, the last push is outside the window, or sections are off', () => {
    const { layer } = createTestLayer(detailHandler());
    expect(layer.estimateDetailRequests({ ...summary, hasIssues: false }).requests).toBe(8);
    expect(layer.estimateDetailRequests({ ...summary, pushedAt: '2020-01-01T00:00:00.000Z' }).requests).toBe(8);
    // An unknown push date can't rule recent authors out.
    expect(layer.estimateDetailRequests({ ...summary, pushedAt: null }).requests).toBe(9);

    const reduced = createTestLayer(detailHandler(), {
      switches: { manifest: false, branches: false, ci: false, recentAuthors: false },
    });
    expect(reduced.layer.estimateDetailRequests(summary).requests).toBe(4);
    expect(reduced.layer.estimateDetailRequests({ ...summary, hasIssues: false }).requests).toBe(3);
  });

  it('reports an unknown budget, and no warning, before any GitHub request', async () => {
    const { layer, transport } = createTestLayer(detailHandler());
    const estimate = layer.estimateDetailRequests(summary);
    expect(estimate).toMatchObject({ budget: null, mayNotComplete: false });
    expect(transport.calls).toHaveLength(0);

    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('flags may-not-complete only when the budget is known and smaller than the estimate', async () => {
    const low = createTestLayer(() => rawFrom(capturedResponse('user.ncptunex.json'), { remaining: 5 }));
    await low.layer.lookupUser('ncptunex');
    expect(low.layer.estimateDetailRequests(summary)).toMatchObject({ requests: 9, budget: 5, mayNotComplete: true });

    const enough = createTestLayer(() => rawFrom(capturedResponse('user.ncptunex.json'), { remaining: 9 }));
    await enough.layer.lookupUser('ncptunex');
    expect(enough.layer.estimateDetailRequests(summary)).toMatchObject({ budget: 9, mayNotComplete: false });
  });

  it('adds the may-not-complete warning to the detail result, and still runs the detail', async () => {
    const base = detailHandler();
    // The profile lookup makes the budget known (7). The detail replies keep it at 7.
    const { layer, transport } = createTestLayer((request, number) => {
      if (request.endpointId === 'user') return rawFrom(capturedResponse('user.ncptunex.json'), { remaining: 7 });
      const raw = base(request, number);
      return { ...raw, rateLimit: { ...raw.rateLimit, remaining: 7 } };
    });
    await layer.lookupUser('ncptunex');
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check', { summary });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ kind: 'may-not-complete', estimate: 9, budget: 7 }),
    );
    // The warning is advisory: every section was still requested.
    expect(transport.calls).toHaveLength(10);
    expect(result.data.sections.readme.status).toBe('available');
  });

  it('stops sending requests when the budget reaches 0, keeps received sections, and marks the rest rate-limited', async () => {
    const base = detailHandler();
    // The core reply leaves 2, the next leaves 1, and the one after that leaves 0.
    const { layer, transport } = createTestLayer((request, number) => {
      const raw = base(request, number);
      return { ...raw, rateLimit: { ...raw.rateLimit, remaining: Math.max(0, 3 - number) } };
    });
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Core, plus the four step-2 requests that were already under way. Nothing after that.
    expect(transport.calls.length).toBeLessThan(9);
    const sections = Object.values(result.data.sections);
    const unavailable = sections.filter((section) => section.status === 'unavailable');
    expect(unavailable.length).toBeGreaterThan(0);
    for (const section of unavailable) expect(section).toEqual({ status: 'unavailable', reason: 'rate-limited' });
    expect(sections.some((section) => section.status === 'available')).toBe(true);

    // An incomplete detail is not cached.
    const again = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(again.ok && again.provenance.source).not.toBe('cache');
  });

  it('stops after the core request when the core reply leaves a budget of 0', async () => {
    const base = detailHandler();
    const { layer, transport } = createTestLayer((request, number) => {
      const raw = base(request, number);
      return { ...raw, rateLimit: { ...raw.rateLimit, remaining: 0 } };
    });
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');

    expect(result.ok).toBe(true);
    expect(transport.calls).toHaveLength(1);
    if (!result.ok) return;
    expect(result.data.core.fullName).toBe('dubzzz/fast-check');
    expect(result.data.sections.readme).toEqual({ status: 'unavailable', reason: 'rate-limited' });
    expect(result.data.sections.openIssues).toEqual({ status: 'unavailable', reason: 'rate-limited' });
    expect(result.data.sections.manifest).toEqual({ status: 'unavailable', reason: 'rate-limited' });
  });

  it('reports a section that gets a primary rate limit as rate-limited and sends nothing after it', async () => {
    const { layer, transport } = createTestLayer(
      detailHandler({ readme: constructedResponse('rate-limit-primary-403.json') }),
    );
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sections.readme).toEqual({ status: 'unavailable', reason: 'rate-limited' });
    expect(result.rateLimit.blockedUntil).not.toBeNull();
    // Nothing is retried, and nothing starts after the limit was seen.
    expect(transport.calls.filter((call) => call.endpointId === 'readme')).toHaveLength(1);
    expect(transport.calls.length).toBeLessThan(9);
  });
});

describe('detail request properties (design 8.9)', () => {
  it('property: with the budget falling to 0 at any point, no request starts after the reply that reported 0', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 9 }), async (limit) => {
        const base = detailHandler();
        let callsAtZero: number | null = null;
        // The handler only runs after `testLayer` exists.
        const testLayer: ReturnType<typeof createTestLayer> = createTestLayer((request, number) => {
          const raw = base(request, number);
          const remaining = Math.max(0, limit - number);
          if (remaining === 0 && callsAtZero === null) callsAtZero = testLayer.transport.calls.length;
          return { ...raw, rateLimit: { ...raw.rateLimit, remaining } };
        });
        const result = await testLayer.layer.getRepositoryDetail('dubzzz', 'fast-check');
        expect(result.ok).toBe(true);
        const total = testLayer.transport.calls.length;
        expect(total).toBeLessThanOrEqual(9);
        if (callsAtZero !== null) expect(total).toBe(callsAtZero);
      }),
      { numRuns: 30 },
    );
  });

  /** A core response with the issues setting and push date changed. */
  function coreWith(hasIssues: boolean, pushedAt: string | null) {
    const response = capturedResponse('repo.dubzzz.fast-check.json');
    return { ...response, body: { ...(response.body as object), has_issues: hasIssues, pushed_at: pushedAt } };
  }

  it('property: the number of requests is between 1 and 9 and never more than the estimate', async () => {
    const failure = fc.constantFrom('readme', 'commits:latest', 'issues', 'branches', 'workflow-runs', 'root-contents', 'commits:since', 'commits:path');
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // issues turned on
        fc.constantFrom('recent', 'old', 'unknown'), // last push
        fc.boolean(), // latest commit is recent
        fc.boolean(), // the repository is empty
        fc.boolean(), // the root folder has a manifest
        fc.record({ manifest: fc.boolean(), branches: fc.boolean(), ci: fc.boolean(), recentAuthors: fc.boolean() }),
        fc.uniqueArray(failure, { maxLength: 3 }),
        async (hasIssues, push, commitRecent, isEmpty, hasManifest, switches, failing) => {
          const pushedAt = push === 'recent' ? '2026-11-22T10:59:56Z' : push === 'old' ? '2020-01-01T00:00:00Z' : null;
          // A commit can't be newer than the last push, so an old push means an old commit.
          const latestIsRecent = commitRecent && push !== 'old';
          const latest = capturedResponse('commits-latest.dubzzz.fast-check.json');
          const latestBody = structuredClone(latest.body) as { commit: { committer: { date: string } } }[];
          if (!latestIsRecent && latestBody[0]) latestBody[0].commit.committer.date = '2020-01-01T00:00:00Z';

          const overrides: Parameters<typeof detailHandler>[0] = {
            repo: coreWith(hasIssues, pushedAt),
            'commits:latest': isEmpty ? constructedResponse('empty-repo-commits-409.json') : { ...latest, body: latestBody },
            'root-contents': hasManifest
              ? capturedResponse('root-contents.ncptunex.foodstarter.json')
              : { status: 200, headers: {}, body: [{ name: 'README.md', path: 'README.md', type: 'file' }] },
          };
          for (const key of failing) {
            if (key !== 'commits:latest') overrides[key] = transportFailure('network');
          }

          const { layer, transport } = createTestLayer(detailHandler(overrides), { switches });
          const core = adaptRepository(coreWith(hasIssues, pushedAt).body);
          expect(core.ok).toBe(true);
          if (!core.ok) return;
          const estimate = layer.estimateDetailRequests(core.value).requests;

          const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');
          expect(result.ok).toBe(true);
          expect(transport.calls.length).toBeGreaterThanOrEqual(1);
          expect(transport.calls.length).toBeLessThanOrEqual(9);
          expect(transport.calls.length).toBeLessThanOrEqual(estimate);
          expect(transport.maxConcurrent()).toBeLessThanOrEqual(4);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('the estimate helper matches design 3.3 and 3.5 for the documented cases', () => {
    const base = { hasIssues: true, pushedAt: '2026-11-22T10:00:00Z' };
    expect(maxDetailRequests(base, SECTION_SWITCHES, WINDOW_START)).toBe(9);
    // Issues off and an old push give 7. The real minimum of 6 needs "no manifest", which is not
    // known until the root folder has been read, so the estimate stays an upper bound.
    expect(maxDetailRequests({ hasIssues: false, pushedAt: '2020-01-01T00:00:00Z' }, SECTION_SWITCHES, WINDOW_START)).toBe(
      7,
    );
  });
});

describe('getRepositoryDetail through the real direct transport', () => {
  it('sends only catalogue URLs, with no token, for a full detail', async () => {
    const table = detailHandler();
    const urls: string[] = [];
    const headersSeen: Record<string, string>[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      headersSeen.push({ ...(init?.headers as Record<string, string>) });
      const parsed = new URL(url);
      const query = Object.fromEntries(parsed.searchParams.entries());
      const endpointId = parsed.pathname.endsWith('/readme')
        ? 'readme'
        : parsed.pathname.endsWith('/commits')
          ? 'commits'
          : parsed.pathname.endsWith('/issues')
            ? 'issues'
            : parsed.pathname.endsWith('/branches')
              ? 'branches'
              : parsed.pathname.endsWith('/runs')
                ? 'workflow-runs'
                : parsed.pathname.endsWith('/contents')
                  ? 'root-contents'
                  : 'repo';
      const raw = await table({ endpointId, pathValues: {}, query } as Parameters<typeof table>[0], 0);
      return new Response(JSON.stringify(raw.data), {
        status: raw.status,
        headers: {
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '40',
          'x-ratelimit-reset': '1795359600',
        },
      });
    }) as typeof fetch;

    const layer = createGitHubDataLayer({
      transport: createDirectTransport({ fetchImpl, now: () => START }),
      storage: null,
      now: () => START,
    });
    const result = await layer.getRepositoryDetail('dubzzz', 'fast-check');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(urls).toHaveLength(9);
    for (const url of urls) expect(url.startsWith('https://api.github.com/repos/dubzzz/fast-check')).toBe(true);
    for (const headers of headersSeen) expect(headers.Authorization).toBeUndefined();
    for (const section of Object.values(result.data.sections)) expect(section.status).toBe('available');
  });
});
