// Task 3.4: catalogue, validators and URL builder, plus the username property test (design 8.9).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildGitHubUrl } from '../../shared/github-endpoints/build-url';
import {
  DETAIL_FRESHNESS_MS,
  ENDPOINTS,
  ENDPOINT_IDS,
  GITHUB_ACCEPT_HEADER,
  GITHUB_API_VERSION,
  GITHUB_BASE_URL,
  KNOWN_MANIFESTS,
  PROFILE_AND_LIST_FRESHNESS_MS,
  SECTION_SWITCHES,
} from '../../shared/github-endpoints/catalogue';
import { isValidRepositoryName, isValidUsername } from '../../shared/github-endpoints/validators';

describe('endpoint catalogue', () => {
  it('pins the API version, Accept header and base URL', () => {
    expect(GITHUB_API_VERSION).toBe('2026-03-10');
    expect(GITHUB_ACCEPT_HEADER).toBe('application/vnd.github+json');
    expect(GITHUB_BASE_URL).toBe('https://api.github.com');
  });

  it('lists exactly the MVP endpoints', () => {
    expect([...ENDPOINT_IDS].sort()).toEqual(
      [
        'branches',
        'commits',
        'issues',
        'org-repos',
        'readme',
        'repo',
        'root-contents',
        'user',
        'user-repos',
        'workflow-runs',
      ].sort(),
    );
  });

  it('uses 10 minutes for profiles and lists and 30 minutes for detail sections', () => {
    expect(PROFILE_AND_LIST_FRESHNESS_MS).toBe(10 * 60 * 1000);
    expect(DETAIL_FRESHNESS_MS).toBe(30 * 60 * 1000);
    for (const id of ['user', 'user-repos', 'org-repos'] as const) {
      expect(ENDPOINTS[id].freshnessMs).toBe(PROFILE_AND_LIST_FRESHNESS_MS);
    }
    for (const id of ENDPOINT_IDS.filter((id) => !['user', 'user-repos', 'org-repos'].includes(id))) {
      expect(ENDPOINTS[id].freshnessMs).toBe(DETAIL_FRESHNESS_MS);
    }
  });

  it('lists the known manifests in the fixed order', () => {
    expect(KNOWN_MANIFESTS).toEqual([
      'package.json',
      'requirements.txt',
      'pyproject.toml',
      'Cargo.toml',
      'go.mod',
      'pom.xml',
      'build.gradle',
      'Gemfile',
      'composer.json',
    ]);
  });

  it('switches every optional section on by default', () => {
    expect(SECTION_SWITCHES).toEqual({ manifest: true, branches: true, ci: true, recentAuthors: true });
  });
});

describe('isValidUsername', () => {
  it.each(['octocat', 'a', 'vitest-dev', 'A1-b2', 'a'.repeat(39), 'name-', 'a--b'])('accepts %s', (name) => {
    expect(isValidUsername(name)).toBe(true);
  });

  it.each(['', '-octocat', 'a'.repeat(40), 'octo_cat', 'octo cat', 'octo.cat', 'ünïcode'])(
    'rejects %j',
    (name) => {
      expect(isValidUsername(name)).toBe(false);
    },
  );

  // Oracle written as plain character checks, independent of the validator's regex.
  function followsUsernameRules(value: string): boolean {
    if (value.length < 1 || value.length > 39) return false;
    if (value.startsWith('-')) return false;
    const allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
    return [...value].every((char) => allowed.includes(char));
  }

  it('accepts a string exactly when it follows the D23 rules (property)', () => {
    const nearlyValidChar = fc.constantFrom(...'abcXYZ019-_. é'.split(''));
    const candidates = fc.oneof(
      fc.string(),
      fc.string({ unit: nearlyValidChar, minLength: 0, maxLength: 45 }),
    );
    fc.assert(
      fc.property(candidates, (value) => isValidUsername(value) === followsUsernameRules(value)),
      { seed: 20261122, numRuns: 500 },
    );
  });
});

describe('isValidRepositoryName', () => {
  it.each(['Hello-World', 'next.js', 'a_b', '.github', '..x', 'a'.repeat(100)])('accepts %s', (name) => {
    expect(isValidRepositoryName(name)).toBe(true);
  });

  it.each(['', '.', '..', 'a'.repeat(101), 'a/b', 'a b', 'a?b'])('rejects %j', (name) => {
    expect(isValidRepositoryName(name)).toBe(false);
  });
});

describe('buildGitHubUrl', () => {
  it('builds a user URL', () => {
    expect(buildGitHubUrl('user', { owner: 'octocat' })).toEqual({
      ok: true,
      url: 'https://api.github.com/users/octocat',
    });
  });

  it('builds a repository list URL with the allowed query values', () => {
    const result = buildGitHubUrl(
      'org-repos',
      { owner: 'vitest-dev' },
      { type: 'public', sort: 'pushed', direction: 'desc', per_page: 100, page: 2 },
    );
    expect(result).toEqual({
      ok: true,
      url: 'https://api.github.com/orgs/vitest-dev/repos?type=public&sort=pushed&direction=desc&per_page=100&page=2',
    });
  });

  it('builds a commits URL with since and a manifest path', () => {
    const result = buildGitHubUrl(
      'commits',
      { owner: 'ncptunex', repo: 'foodstarter' },
      { since: '2025-11-22T00:00:00Z', path: 'package.json', per_page: 1 },
    );
    expect(result).toEqual({
      ok: true,
      url: 'https://api.github.com/repos/ncptunex/foodstarter/commits?since=2025-11-22T00%3A00%3A00Z&path=package.json&per_page=1',
    });
  });

  it('rejects an endpoint that is not in the catalogue', () => {
    expect(buildGitHubUrl('search', { owner: 'octocat' }).ok).toBe(false);
  });

  it('rejects a missing or invalid path value', () => {
    expect(buildGitHubUrl('repo', { owner: 'octocat' }).ok).toBe(false);
    expect(buildGitHubUrl('repo', { owner: 'octocat', repo: '../secrets' }).ok).toBe(false);
    expect(buildGitHubUrl('user', { owner: '-bad' }).ok).toBe(false);
  });

  it('rejects query parameters that are not allowed for the endpoint', () => {
    expect(buildGitHubUrl('user', { owner: 'octocat' }, { per_page: 1 }).ok).toBe(false);
    expect(buildGitHubUrl('issues', { owner: 'a', repo: 'b' }, { state: 'all' }).ok).toBe(false);
  });

  it('rejects query values outside the allowed range or set', () => {
    const owner = { owner: 'octocat' };
    const repo = { owner: 'octocat', repo: 'hello' };
    expect(buildGitHubUrl('user-repos', owner, { per_page: 101 }).ok).toBe(false);
    expect(buildGitHubUrl('user-repos', owner, { per_page: 0 }).ok).toBe(false);
    expect(buildGitHubUrl('user-repos', owner, { page: 4 }).ok).toBe(false);
    expect(buildGitHubUrl('user-repos', owner, { type: 'all' }).ok).toBe(false);
    expect(buildGitHubUrl('workflow-runs', repo, { per_page: 2 }).ok).toBe(false);
    expect(buildGitHubUrl('commits', repo, { since: 'yesterday' }).ok).toBe(false);
    expect(buildGitHubUrl('commits', repo, { path: 'README.md' }).ok).toBe(false);
  });
});
