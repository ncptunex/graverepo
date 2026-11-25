// The endpoint catalogue: the single place that lists which GitHub endpoints GRAVEREPO
// may call, which query values each accepts, how long results stay fresh, and the
// pinned API version (data-layer design 4.2, Req 12.5).
// The client uses it in Phase 1. The Phase 2 proxy will use the same file as its allowlist.
// This module imports nothing, so both sides can share it.

/** GitHub REST API version sent in `X-GitHub-Api-Version` (checked 22 Nov 2026, task 1.2). */
export const GITHUB_API_VERSION = '2026-03-10';

export const GITHUB_ACCEPT_HEADER = 'application/vnd.github+json';

export const GITHUB_BASE_URL = 'https://api.github.com';

const MINUTE_MS = 60 * 1000;

/** Freshness windows (D7, Req 7.2). */
export const PROFILE_AND_LIST_FRESHNESS_MS = 10 * MINUTE_MS;
export const DETAIL_FRESHNESS_MS = 30 * MINUTE_MS;

/**
 * Known dependency manifests, checked in this order in the root folder only (D5, Req 4.8).
 * The first one found is the one whose last change is requested.
 */
export const KNOWN_MANIFESTS = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
] as const;

export type KnownManifest = (typeof KNOWN_MANIFESTS)[number];

/**
 * Optional detail sections (D26, Req 4.13). All are on by default.
 * If development falls behind, switch them off in this order:
 * manifest, branches, ci, recentAuthors (Req 4.15).
 * Core metadata, README, latest commit and open issues have no switch and always run.
 */
export type OptionalSection = 'manifest' | 'branches' | 'ci' | 'recentAuthors';

export type SectionSwitches = Readonly<Record<OptionalSection, boolean>>;

export const SECTION_SWITCHES: SectionSwitches = {
  manifest: true,
  branches: true,
  ci: true,
  recentAuthors: true,
};

/** Describes which values one query parameter accepts. */
export type QueryRule =
  | { readonly kind: 'fixed'; readonly values: readonly string[] }
  | { readonly kind: 'integer'; readonly min: number; readonly max: number }
  | { readonly kind: 'iso-date' }
  | { readonly kind: 'manifest-name' };

export type PathParam = 'owner' | 'repo';

export type EndpointDefinition = {
  /** GitHub path with `{owner}` and `{repo}` placeholders. */
  readonly path: string;
  readonly pathParams: readonly PathParam[];
  readonly query: Readonly<Record<string, QueryRule>>;
  readonly freshnessMs: number;
};

const perPage: QueryRule = { kind: 'integer', min: 1, max: 100 };
// Pages 1–3 of 100 cover the 300-repository cap (D2).
const repoListPage: QueryRule = { kind: 'integer', min: 1, max: 3 };

/** Every MVP endpoint (design 4.2). Nothing outside this table may be requested. */
export const ENDPOINTS = {
  user: {
    path: '/users/{owner}',
    pathParams: ['owner'],
    query: {},
    freshnessMs: PROFILE_AND_LIST_FRESHNESS_MS,
  },
  'user-repos': {
    path: '/users/{owner}/repos',
    pathParams: ['owner'],
    query: {
      type: { kind: 'fixed', values: ['owner'] },
      sort: { kind: 'fixed', values: ['pushed'] },
      direction: { kind: 'fixed', values: ['desc'] },
      per_page: perPage,
      page: repoListPage,
    },
    freshnessMs: PROFILE_AND_LIST_FRESHNESS_MS,
  },
  'org-repos': {
    path: '/orgs/{owner}/repos',
    pathParams: ['owner'],
    query: {
      type: { kind: 'fixed', values: ['public'] },
      sort: { kind: 'fixed', values: ['pushed'] },
      direction: { kind: 'fixed', values: ['desc'] },
      per_page: perPage,
      page: repoListPage,
    },
    freshnessMs: PROFILE_AND_LIST_FRESHNESS_MS,
  },
  repo: {
    path: '/repos/{owner}/{repo}',
    pathParams: ['owner', 'repo'],
    query: {},
    freshnessMs: DETAIL_FRESHNESS_MS,
  },
  readme: {
    path: '/repos/{owner}/{repo}/readme',
    pathParams: ['owner', 'repo'],
    query: {},
    freshnessMs: DETAIL_FRESHNESS_MS,
  },
  commits: {
    path: '/repos/{owner}/{repo}/commits',
    pathParams: ['owner', 'repo'],
    query: {
      per_page: perPage,
      since: { kind: 'iso-date' },
      path: { kind: 'manifest-name' },
    },
    freshnessMs: DETAIL_FRESHNESS_MS,
  },
  issues: {
    path: '/repos/{owner}/{repo}/issues',
    pathParams: ['owner', 'repo'],
    query: {
      state: { kind: 'fixed', values: ['open'] },
      sort: { kind: 'fixed', values: ['created'] },
      direction: { kind: 'fixed', values: ['asc'] },
      per_page: perPage,
    },
    freshnessMs: DETAIL_FRESHNESS_MS,
  },
  branches: {
    path: '/repos/{owner}/{repo}/branches',
    pathParams: ['owner', 'repo'],
    query: { per_page: perPage },
    freshnessMs: DETAIL_FRESHNESS_MS,
  },
  'workflow-runs': {
    path: '/repos/{owner}/{repo}/actions/runs',
    pathParams: ['owner', 'repo'],
    query: { per_page: { kind: 'fixed', values: ['1'] } },
    freshnessMs: DETAIL_FRESHNESS_MS,
  },
  'root-contents': {
    path: '/repos/{owner}/{repo}/contents',
    pathParams: ['owner', 'repo'],
    query: {},
    freshnessMs: DETAIL_FRESHNESS_MS,
  },
} as const satisfies Record<string, EndpointDefinition>;

export type EndpointId = keyof typeof ENDPOINTS;

export const ENDPOINT_IDS = Object.keys(ENDPOINTS) as EndpointId[];

export function isEndpointId(value: string): value is EndpointId {
  return Object.prototype.hasOwnProperty.call(ENDPOINTS, value);
}
