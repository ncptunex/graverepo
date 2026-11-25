// Demo journey integration tests (dashboard D-I1, ritual I1, I2, I3, scan D-I3).
// The test-only demo data is used here and nowhere in production code. `fetch` throws if called.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Graveyard } from '../../src/screens/graveyard/Graveyard';
import { Landing } from '../../src/screens/landing/Landing';
import { Living } from '../../src/screens/living/Living';
import { RitualScreen } from '../../src/screens/ritual/RitualScreen';
import { createDashboardSession } from '../../src/state/dashboard-session';
import { createProgressStore, type ProgressStorage } from '../../src/state/progress-store';
import { createRitualSession } from '../../src/state/ritual-session';
import { createFakeRitualDataLayer } from '../ritual/test-demo';

class MemoryStorage implements ProgressStorage {
  readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

const KL = { locale: 'en-GB', timeZone: 'Asia/Kuala_Lumpur' };
const NOW = '2026-11-23T12:00:00.000Z';

function build(storage = new MemoryStorage()) {
  const dataLayer = createFakeRitualDataLayer();
  const ritual = createRitualSession({
    dataLayer,
    store: createProgressStore({ storage, now: () => new Date(NOW) }),
    now: () => new Date(NOW),
    displayContext: KL,
  });
  const dashboard = createDashboardSession({
    dataLayer: {
      listRepositories: async () => {
        throw new Error('listRepositories must not be called in the demo');
      },
      loadDemoGraveyard: dataLayer.loadDemoGraveyard,
    },
    ritual,
  });
  return { dashboard, ritual, storage, dataLayer };
}

const html = (session: ReturnType<typeof build>) => {
  const state = session.dashboard.getState();
  switch (state.view) {
    case 'landing':
      return renderToStaticMarkup(<Landing onSearch={() => {}} onDemo={() => {}} />);
    case 'graveyard':
      return renderToStaticMarkup(<Graveyard state={state} session={session.dashboard} displayContext={KL} now={NOW} />);
    case 'ritual':
      return renderToStaticMarkup(
        <RitualScreen state={session.ritual.getState()} ritual={session.ritual} dashboard={session.dashboard} displayContext={KL} now={NOW} />,
      );
    case 'living':
      return renderToStaticMarkup(<Living records={state.revived} displayContext={KL} />);
  }
};

describe('demo journey with GitHub blocked (D-I1, I1)', () => {
  const fetchSpy = vi.fn(() => {
    throw new Error('fetch must not be called');
  });
  beforeEach(() => vi.stubGlobal('fetch', fetchSpy));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockClear();
  });

  it('runs the whole ritual: demo, tombstone, necropsy, plan, rising, revive, The Living', async () => {
    const app = build();
    const { dashboard, ritual } = app;

    expect(html(app)).toContain('Dig up your forgotten code.');

    await dashboard.openDemo();
    let page = html(app);
    expect(page).toContain('Demo graveyard, captured on');
    expect(page).toContain('test-two-steps');
    expect(page).toContain('Open to look at the evidence.');

    await dashboard.openTombstone('test-owner', 'test-two-steps');
    expect(dashboard.getState().view).toBe('ritual');
    page = html(app);
    expect(page).toContain('Demo graveyard, captured on');
    expect(page).toContain('Latest commit on');
    expect(page).toContain('Leads to a suggested step');

    expect(ritual.applyStageChange('plan')).toMatchObject({ ok: true });
    page = html(app);
    expect(page).toContain('Because ');
    expect(page).toContain('you could');

    expect(ritual.applyStageChange('living')).toMatchObject({ ok: false });
    ritual.applyStageChange('rising');
    page = html(app);
    expect(page).toContain('Nothing planted yet');
    expect(page).toContain('2 steps left before you can mark this repository as revived in GRAVEREPO.');
    expect(ritual.markRevived()).toMatchObject({ ok: false });

    const state = ritual.getState();
    if (state.status !== 'open') throw new Error('expected an open ritual');
    for (const item of state.analysis.plan.items) ritual.toggleItem(item.id);
    page = html(app);
    expect(page).toContain('All steps done. Ready to mark as revived.');
    expect(page).toContain('Progress saved on this device');

    expect(ritual.markRevived()).toMatchObject({ ok: true, saved: true });
    expect(ritual.toggleItem(state.analysis.plan.items[0]!.id)).toMatchObject({ ok: false, reason: 'locked' });
    page = html(app);
    expect(page).toContain('Marked as revived in GRAVEREPO. This is saved on this device only.');

    dashboard.showLiving();
    expect(dashboard.getState().revivedCount).toBe(1);
    page = html(app);
    expect(page).toContain("GRAVEREPO doesn&#x27;t change anything on GitHub.");
    expect(page).toContain('test-owner/test-two-steps');
    expect(page).toContain('Revived in GRAVEREPO on');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('restores the saved stage and ticks after a reload (I2)', async () => {
    const storage = new MemoryStorage();
    const first = build(storage);
    await first.dashboard.openDemo();
    await first.dashboard.openTombstone('test-owner', 'test-two-steps');
    first.ritual.applyStageChange('rising');
    const open = first.ritual.getState();
    if (open.status !== 'open') throw new Error('expected an open ritual');
    first.ritual.toggleItem(open.analysis.plan.items[0]!.id);

    const second = build(storage); // a new page load over the same storage
    await second.dashboard.openDemo();
    await second.dashboard.openTombstone('test-owner', 'test-two-steps');
    const state = second.ritual.getState();
    expect(state).toMatchObject({ status: 'open', stage: 'rising' });
    expect(html(second)).toContain('1 of 2 steps done');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows a repository with nothing to suggest, and the archived note', async () => {
    const app = build();
    await app.dashboard.openDemo();
    await app.dashboard.openTombstone('test-owner', 'test-healthy');
    app.ritual.applyStageChange('plan');
    expect(html(app)).toContain("We didn&#x27;t find anything to suggest from what we could see.");
    await app.dashboard.openTombstone('test-owner', 'test-archived');
    app.ritual.applyStageChange('plan');
    expect(html(app)).toContain('These steps are suggestions only.');
  });

  it('shows no empty tombstone label from the list, and Empty only in the necropsy', async () => {
    const app = build();
    await app.dashboard.openDemo();
    expect(html(app)).not.toMatch(/>Empty</);
    await app.dashboard.openTombstone('test-owner', 'test-empty');
    expect(html(app)).toContain('This repository has no commits yet');
  });

  it('filters the list without a request', async () => {
    const app = build();
    await app.dashboard.openDemo();
    app.dashboard.setFilters({ text: 'two-steps' });
    const page = html(app);
    expect(page).toContain('test-two-steps');
    expect(page).not.toContain('test-healthy');
    app.dashboard.setFilters({ text: 'nothing-matches' });
    expect(html(app)).toContain('No repositories match these filters. Clear the filters to see all 4.');
  });
});

describe('error and loading views', () => {
  it('shows the demo-unavailable error without a demo offer', async () => {
    const dashboard = createDashboardSession({
      dataLayer: {
        listRepositories: async () => {
          throw new Error('unused');
        },
        loadDemoGraveyard: async () => ({
          ok: false,
          error: { kind: 'demo-unavailable', messageKey: 'error.demo-unavailable', details: {}, demoAvailable: false, retryable: false },
          rateLimit: { route: 'direct', limit: null, remaining: null, resetAt: null, tokenUsed: false, blockedUntil: null },
        }),
      },
      ritual: { openRitual: async () => {}, closeRitual: () => {}, listRevived: () => [] },
    });
    await dashboard.openDemo();
    const page = renderToStaticMarkup(<Graveyard state={dashboard.getState()} session={dashboard} displayContext={KL} now={NOW} />);
    expect(page).toContain("The demo graveyard couldn&#x27;t be loaded. Please report this.");
    expect(page).not.toContain('Explore the demo graveyard');
    expect(page).toContain('role="alert"');
  });
});
