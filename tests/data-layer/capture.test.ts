// Tests of the demo capture logic (task 6.4) with a fake `fetch`. Nothing here contacts GitHub.
// The fake answers with real captured fixtures. For repositories with no fixture of their own
// it reuses a similar real response, so these tests check the script's rules and safety
// behaviour. They do not produce, and are never part of, the demo snapshot.
import { describe, expect, it } from 'vitest';
import gitignoreText from '../../.gitignore?raw';
import {
  assertSafeToStore,
  captureDemoSnapshot,
  CaptureError,
  CHECKPOINT_MAX_AGE_MS,
  parseCheckpoint,
  type CaptureCheckpoint,
  estimateMaxRequests,
  MAX_REQUESTS_PER_DETAIL,
  parseRepositoryReference,
  type CuratedList,
  type FetchLike,
} from '../../scripts/capture-demo/capture';
import curatedList from '../../src/data/demo/curated-list.json';
import { buildDemoGraveyard } from '../../src/data/demo/build-demo-graveyard';
import { uncoveredStates } from '../../src/data/demo/required-states';
import { loadCaptured } from './helpers/fixtures';

// Built in two parts so no real-looking token pattern sits in the repository text.
const FAKE_TOKEN = `${'ghp'}_FAKEtokenForTestsOnly0123456789`;
const NOW = new Date('2026-11-22T13:00:00.000Z');

type Answer = { status: number; body: unknown };
type Call = { url: string; headers: Record<string, string> };

const body = (name: string) => loadCaptured(name).body;
const userRepos = body('user-repos.ncptunex.json') as { name: string }[];
const listItem = (name: string) => userRepos.find((item) => item.name === name);

/** The repository response for each curated repository, from real fixtures. */
function repoAnswer(fullName: string): Answer {
  switch (fullName.toLowerCase()) {
    case 'ncptunex/kiroween-2026-graverepo':
      return { status: 200, body: body('repo.ncptunex.Kiroween-2026-GRAVEREPO.json') };
    case 'ncptunex/foodstarter':
      return { status: 200, body: body('repo.ncptunex.foodstarter.json') };
    case 'ncptunex/devops-micro-internship-pravinmishra':
      return { status: 200, body: body('repo.ncptunex.devops-micro-internship-pravinmishra.json') };
    case 'atom/atom':
      return { status: 200, body: body('repo.atom.atom.json') };
    case 'dubzzz/fast-check':
      return { status: 200, body: body('repo.dubzzz.fast-check.json') };
    case 'ncptunex/mae-learnimal-asgm':
    case 'ncptunex/grandstay':
    case 'ncptunex/ioop-assignment-sedapmakan':
      // A list item has the same shape as a repository response.
      return { status: 200, body: listItem(fullName.split('/')[1] ?? '') };
    default:
      return { status: 404, body: { message: 'Not Found' } };
  }
}

type FakeOptions = {
  readmeForFirstRepo?: Answer;
  remaining?: string;
  /** Lookups the fake allows. The remaining header counts down from it, as GitHub's does. */
  budget?: number;
  override?: (pathname: string, search: URLSearchParams) => Answer | undefined;
};

function fakeGitHub(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const parsed = new URL(url);
    const answer = options.override?.(parsed.pathname, parsed.searchParams) ?? route(parsed.pathname, parsed.searchParams);
    return {
      status: answer.status,
      headers: {
        get: (name: string) =>
          name === 'x-ratelimit-remaining'
            ? options.budget !== undefined
              ? String(Math.max(0, options.budget - calls.length))
              : (options.remaining ?? '4900')
            : name === 'x-ratelimit-reset' ? '1795000000' : null,
      },
      text: async () => JSON.stringify(answer.body),
    };
  };

  function route(pathname: string, search: URLSearchParams): Answer {
    const userMatch = /^\/users\/([^/]+)$/.exec(pathname);
    if (userMatch) {
      const login = userMatch[1] ?? '';
      const base = login === 'ncptunex' ? body('user.ncptunex.json') : body('user.vitest-dev.json');
      return { status: 200, body: { ...(base as object), login, type: login === 'ncptunex' ? 'User' : 'Organization' } };
    }
    const repoMatch = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(pathname);
    if (!repoMatch) return { status: 404, body: { message: 'Not Found' } };
    const fullName = `${repoMatch[1]}/${repoMatch[2]}`;
    const rest = repoMatch[3] ?? '';
    const isGravRepo = fullName === 'ncptunex/Kiroween-2026-GRAVEREPO';
    const isFastCheck = fullName === 'dubzzz/fast-check';

    switch (rest) {
      case '':
        return repoAnswer(fullName);
      case '/readme':
        if (isGravRepo) return options.readmeForFirstRepo ?? { status: 404, body: { message: 'Not Found' } };
        return { status: 200, body: body('readme.dubzzz.fast-check.json') };
      case '/commits':
        if (search.has('path')) return { status: 200, body: body('commits-manifest.ncptunex.foodstarter.json') };
        if (search.has('since')) return { status: 200, body: body('commits-since.ncptunex.Kiroween-2026-GRAVEREPO.json') };
        return { status: 200, body: body('commits-latest.dubzzz.fast-check.json') };
      case '/issues':
        return { status: 200, body: body(isFastCheck ? 'issues.dubzzz.fast-check.json' : 'issues.ncptunex.Kiroween-2026-GRAVEREPO.json') };
      case '/branches':
        return { status: 200, body: body('branches.ncptunex.Kiroween-2026-GRAVEREPO.json') };
      case '/actions/runs':
        return { status: 200, body: body(isFastCheck ? 'workflow-runs.dubzzz.fast-check.json' : 'workflow-runs.ncptunex.foodstarter.json') };
      case '/contents':
        return { status: 200, body: body('root-contents.ncptunex.foodstarter.json') };
      default:
        return { status: 404, body: { message: 'Not Found' } };
    }
  }

  return { calls, fetchImpl };
}

const twoRepositories: CuratedList = {
  owner: 'ncptunex',
  repositories: ['ncptunex/Kiroween-2026-GRAVEREPO', 'ncptunex/foodstarter'],
  noReadmeCheckFirst: 'ncptunex/Kiroween-2026-GRAVEREPO',
};

function run(fake: ReturnType<typeof fakeGitHub>, curated: CuratedList, token: string | null = null) {
  const logs: string[] = [];
  const promise = captureDemoSnapshot({
    fetchImpl: fake.fetchImpl,
    token,
    curated,
    now: () => NOW,
    log: (message) => logs.push(message),
  });
  return { promise, logs };
}

describe('capturing the approved eight repositories (fake GitHub)', () => {
  it('returns a snapshot that passes the loader checks and shows all nine states', async () => {
    const fake = fakeGitHub();
    const { promise } = run(fake, curatedList as CuratedList, FAKE_TOKEN);
    const result = await promise;

    expect(result.snapshot.repositories).toHaveLength(8);
    expect(result.snapshot.sourceAccounts).toEqual(['ncptunex', 'atom', 'dubzzz']);
    expect(result.snapshot.curatedRepositories).toEqual(curatedList.repositories);
    expect(result.snapshot.capturedAt).toBe(NOW.toISOString());

    const built = buildDemoGraveyard(result.snapshot);
    expect(built.ok).toBe(true);
    if (built.ok) expect(uncoveredStates(built.graveyard.details, built.windowStart)).toEqual([]);
  });

  it('uses no more requests than planned and never requests the same URL twice', async () => {
    const fake = fakeGitHub();
    const result = await run(fake, curatedList as CuratedList).promise;
    expect(result.requestsUsed).toBe(fake.calls.length);
    expect(fake.calls.length).toBeLessThanOrEqual(estimateMaxRequests(curatedList as CuratedList));
    expect(new Set(fake.calls.map((call) => call.url)).size).toBe(fake.calls.length);
  });

  it('only requests catalogue endpoints on api.github.com, with GET-style headers', async () => {
    const fake = fakeGitHub();
    await run(fake, curatedList as CuratedList).promise;
    for (const call of fake.calls) {
      expect(call.url.startsWith('https://api.github.com/')).toBe(true);
      expect(call.headers['X-GitHub-Api-Version']).toBe('2026-03-10');
      expect(call.headers.Accept).toBe('application/vnd.github+json');
    }
  });

  it('skips the issues request for a repository with issues turned off', async () => {
    const fake = fakeGitHub();
    await run(fake, curatedList as CuratedList).promise;
    const urls = fake.calls.map((call) => call.url);
    expect(urls.some((url) => url.includes('/devops-micro-internship-pravinmishra/issues'))).toBe(false);
    expect(urls.some((url) => url.includes('/foodstarter/issues'))).toBe(true);
  });

  it('keeps the stored responses small and free of GitHub fields GRAVEREPO does not read', async () => {
    const fake = fakeGitHub();
    const result = await run(fake, curatedList as CuratedList).promise;
    const text = JSON.stringify(result.snapshot);
    expect(text).not.toContain('node_id');
    expect(text.length).toBeLessThan(200_000);
  });
});

describe('the no-README check', () => {
  it('requests the README of the first repository before anything else', async () => {
    const fake = fakeGitHub();
    await run(fake, curatedList as CuratedList).promise;
    expect(fake.calls[0]?.url).toBe('https://api.github.com/repos/ncptunex/Kiroween-2026-GRAVEREPO/readme');
  });

  it('stops at once, after one request, when the README now exists', async () => {
    const fake = fakeGitHub({ readmeForFirstRepo: { status: 200, body: body('readme.dubzzz.fast-check.json') } });
    const { promise } = run(fake, curatedList as CuratedList);
    await expect(promise).rejects.toThrow(/now has a README/);
    await expect(promise).rejects.toBeInstanceOf(CaptureError);
    expect(fake.calls).toHaveLength(1);
  });
});

describe('stopping safely', () => {
  it('stops with a clear message on a rate-limit answer', async () => {
    const fake = fakeGitHub({
      override: (pathname) => (pathname.endsWith('/branches') ? { status: 403, body: { message: 'API rate limit exceeded' } } : undefined),
    });
    await expect(run(fake, twoRepositories, FAKE_TOKEN).promise).rejects.toThrow(/rate limit.*Nothing was written/s);
  });

  it('stops on an unexpected status', async () => {
    const fake = fakeGitHub({
      override: (pathname) => (pathname.endsWith('/actions/runs') ? { status: 500, body: { message: 'Server Error' } } : undefined),
    });
    await expect(run(fake, twoRepositories).promise).rejects.toThrow(/Unexpected status 500/);
  });

  it('stops when the lookups left are fewer than the run may need', async () => {
    const fake = fakeGitHub({ remaining: '5' });
    await expect(run(fake, curatedList as CuratedList).promise).rejects.toThrow(/GITHUB_TOKEN/);
    expect(fake.calls).toHaveLength(1);
  });

  it('stops when a repository is reported under a different name', async () => {
    const fake = fakeGitHub({
      override: (pathname) =>
        pathname === '/repos/ncptunex/foodstarter'
          ? { status: 200, body: { ...(body('repo.ncptunex.foodstarter.json') as object), full_name: 'someone/else' } }
          : undefined,
    });
    await expect(run(fake, twoRepositories).promise).rejects.toThrow(/different repository/);
  });

  it('stops, listing the states, when the captured data misses a required state', async () => {
    const fake = fakeGitHub();
    await expect(run(fake, twoRepositories).promise).rejects.toThrow(/required states are not shown.*Archived/s);
  });

  it('stops when a required repository is not found', async () => {
    const fake = fakeGitHub();
    const curated: CuratedList = { ...twoRepositories, repositories: [...twoRepositories.repositories, 'ncptunex/does-not-exist'] };
    await expect(run(fake, curated).promise).rejects.toThrow(/Unexpected status 404/);
  });
});

describe('the token', () => {
  it('is sent only as the Authorization header, and only when set', async () => {
    const withToken = fakeGitHub();
    await run(withToken, curatedList as CuratedList, FAKE_TOKEN).promise;
    expect(withToken.calls.every((call) => call.headers.Authorization === `Bearer ${FAKE_TOKEN}`)).toBe(true);

    const withoutToken = fakeGitHub();
    await run(withoutToken, curatedList as CuratedList, null).promise;
    expect(withoutToken.calls.every((call) => call.headers.Authorization === undefined)).toBe(true);
  });

  it('never appears in the log, an error message or the snapshot', async () => {
    const ok = run(fakeGitHub(), curatedList as CuratedList, FAKE_TOKEN);
    const result = await ok.promise;
    expect(ok.logs.join('\n')).not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(result.snapshot)).not.toContain(FAKE_TOKEN);

    const failing = run(fakeGitHub({ override: () => ({ status: 403, body: { message: 'API rate limit exceeded' } }) }), twoRepositories, FAKE_TOKEN);
    const error = await failing.promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CaptureError);
    expect(String((error as Error).message)).not.toContain(FAKE_TOKEN);
    expect(failing.logs.join('\n')).not.toContain(FAKE_TOKEN);
  });

  it('is refused by the safety scan if it ever reached the data', () => {
    expect(() => assertSafeToStore(`{"x":"${FAKE_TOKEN}"}`, FAKE_TOKEN)).toThrow(/token/);
    expect(() => assertSafeToStore(`{"x":"${'ghp'}_abc123"}`, null)).toThrow(/token/);
  });
});

describe('safety scans and list checks', () => {
  it('refuses data that holds an email address', () => {
    expect(() => assertSafeToStore('{"name":"someone@example.com"}', null)).toThrow(/email/);
  });

  it('accepts data with neither', () => {
    expect(() => assertSafeToStore('{"name":"Someone"}', null)).not.toThrow();
  });

  it('parses owner/name and rejects anything else', () => {
    expect(parseRepositoryReference('atom/atom')).toMatchObject({ owner: 'atom', repo: 'atom' });
    for (const bad of ['atom', 'a/b/c', '/x', 'x/', '../x', 'bad owner/x']) {
      expect(() => parseRepositoryReference(bad)).toThrow(CaptureError);
    }
  });

  it('plans at most 9 requests for each repository plus one for each account (75 for the approved list)', () => {
    expect(MAX_REQUESTS_PER_DETAIL).toBe(9);
    expect(estimateMaxRequests(curatedList as CuratedList)).toBe(8 * 9 + 3);
  });
});

describe('pause and resume without a token (fake GitHub, no network)', () => {
  const curated = curatedList as CuratedList;
  const LATER = new Date(NOW.getTime() + 61 * 60 * 1000);

  /** A checkpoint store that starts from `data` and remembers every save. */
  function memoryStore(data: CaptureCheckpoint | null) {
    const saves: CaptureCheckpoint[] = [];
    return { data, saves, save: async (progress: CaptureCheckpoint) => void saves.push(progress) };
  }

  function runWith(fake: ReturnType<typeof fakeGitHub>, store: ReturnType<typeof memoryStore>, now: Date, token: string | null = null) {
    return captureDemoSnapshot({ fetchImpl: fake.fetchImpl, token, curated, now: () => now, log: () => {}, checkpoint: store });
  }

  it('pauses when the lookups run out, writes no snapshot and keeps every response it fetched', async () => {
    const fake = fakeGitHub({ budget: 30 });
    const store = memoryStore(null);
    await expect(runWith(fake, store, NOW)).rejects.toThrow(/Paused:.*Run the same command again after.*No snapshot was written/s);
    expect(fake.calls).toHaveLength(30);
    expect(Object.keys(store.saves.at(-1)?.responses ?? {})).toHaveLength(30);
  });

  it('finishes in a second run with the same snapshot as one uninterrupted run, and keeps the first capturedAt', async () => {
    const oneRun = await runWith(fakeGitHub(), memoryStore(null), NOW);

    const first = fakeGitHub({ budget: 30 });
    const firstStore = memoryStore(null);
    await expect(runWith(first, firstStore, NOW)).rejects.toThrow(/Paused/);

    const second = fakeGitHub();
    const secondStore = memoryStore(firstStore.saves.at(-1) ?? null);
    const result = await runWith(second, secondStore, LATER);

    expect(result.snapshot.capturedAt).toBe(NOW.toISOString());
    expect(result.snapshot).toEqual(oneRun.snapshot);
    // No URL was requested in both runs, and together they asked for exactly what one run asks for.
    const firstUrls = new Set(first.calls.map((call) => call.url));
    expect(second.calls.some((call) => firstUrls.has(call.url))).toBe(false);
    expect(first.calls.length + second.calls.length).toBe(oneRun.requestsUsed);
    const built = buildDemoGraveyard(result.snapshot);
    expect(built.ok).toBe(true);
    if (built.ok) expect(uncoveredStates(built.graveyard.details, built.windowStart)).toEqual([]);
  });

  it('still stops at once when the README of the first repository now exists, even on a resumed run', async () => {
    const fake = fakeGitHub({ readmeForFirstRepo: { status: 200, body: body('readme.dubzzz.fast-check.json') } });
    await expect(runWith(fake, memoryStore(null), NOW)).rejects.toThrow(/now has a README/);
    expect(fake.calls).toHaveLength(1);
  });

  it('pauses, instead of failing, when GitHub answers with a rate-limit status', async () => {
    const fake = fakeGitHub({ override: (pathname) => (pathname.endsWith('/branches') ? { status: 403, body: { message: 'API rate limit exceeded' } } : undefined) });
    const store = memoryStore(null);
    await expect(runWith(fake, store, NOW)).rejects.toThrow(/Paused:/);
    expect(store.saves.length).toBeGreaterThan(0);
  });

  it('keeps tokens, emails and request headers out of the checkpoint', async () => {
    const fake = fakeGitHub({ budget: 40 });
    const store = memoryStore(null);
    await expect(runWith(fake, store, NOW, FAKE_TOKEN)).rejects.toThrow(/Paused/);
    const text = JSON.stringify(store.saves.at(-1));
    expect(text).not.toContain(FAKE_TOKEN);
    expect(text).not.toMatch(/Authorization|Bearer/i);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(text).not.toContain('node_id');
  });

  it('refuses progress that is older than 24 hours or belongs to a different list', async () => {
    const fake = fakeGitHub({ budget: 30 });
    const store = memoryStore(null);
    await expect(runWith(fake, store, NOW)).rejects.toThrow(/Paused/);
    const saved = store.saves.at(-1) as CaptureCheckpoint;

    const tooLate = new Date(NOW.getTime() + CHECKPOINT_MAX_AGE_MS + 1000);
    await expect(runWith(fakeGitHub(), memoryStore(saved), tooLate)).rejects.toThrow(/older than 24 hours/);
    const otherList = { ...saved, curatedRepositories: saved.curatedRepositories.slice(1) };
    const untouched = fakeGitHub();
    await expect(runWith(untouched, memoryStore(otherList), LATER)).rejects.toThrow(/does not match this capture/);
    expect(untouched.calls).toHaveLength(0);
  });

  it('reads saved progress only when it is valid and free of emails and tokens', () => {
    expect(() => parseCheckpoint('not json')).toThrow(CaptureError);
    expect(() => parseCheckpoint('{"version":2}')).toThrow(CaptureError);
    const valid = { version: 1, capturedAt: NOW.toISOString(), captureScriptVersion: '1.0.0', apiVersion: '2026-03-10', curatedRepositories: [], responses: {} };
    expect(parseCheckpoint(JSON.stringify(valid)).capturedAt).toBe(NOW.toISOString());
    const withEmail = { ...valid, responses: { x: { status: 200, body: { note: 'someone@example.com' } } } };
    expect(() => parseCheckpoint(JSON.stringify(withEmail))).toThrow(/email/);
  });

  it('is kept out of Git', () => {
    expect(gitignoreText).toContain('scripts/capture-demo/capture-progress.json');
  });
});
