// The demo capture logic (data-layer task 6.4, design 4.8). It runs by hand on a developer
// machine, never in a build or a test against GitHub. The tests give it a fake `fetch`.
//
// What it does:
// 1. Confirms the no-README state of the first repository, and stops if that changed.
// 2. Requests each profile and each curated repository's detail through the endpoint
//    catalogue, with the same skip rules as the live detail (shared in `detail-assembly`).
// 3. Strips each response to the fields GRAVEREPO reads.
// 4. Checks the result with the same loader the app uses, checks the nine required states,
//    and scans for emails and tokens. Only then does it return a snapshot.
// 5. Without a token GitHub allows 60 lookups an hour, which is fewer than a full capture
//    needs. With a `checkpoint` the run saves each stripped response as it arrives, pauses
//    when the lookups run out, and a later run reuses the saved responses. The first run's
//    `capturedAt` is kept, so the 12-month activity window is the same in every run.
//
// The token (optional) is read by the caller and passed in. It is used only for the
// `Authorization` header. It is never logged, put in an error message or stored.
import { z } from 'zod';
import {
  GITHUB_ACCEPT_HEADER,
  GITHUB_API_VERSION,
  type EndpointId,
} from '../../shared/github-endpoints/catalogue';
import {
  buildGitHubUrl,
  type PathValues,
  type QueryValues,
} from '../../shared/github-endpoints/build-url';
import { isValidRepositoryName, isValidUsername } from '../../shared/github-endpoints/validators';
import { buildDemoGraveyard } from '../../src/data/demo/build-demo-graveyard';
import { REQUIRED_STATES, uncoveredStates } from '../../src/data/demo/required-states';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type DemoSnapshot,
  type RepositoryResponses,
  type StoredResponse,
} from '../../src/data/demo/snapshot-schema';
import { activityWindowStart, planDependentRequests } from '../../src/data/github/detail-assembly';
import {
  stripBranches,
  stripCommits,
  stripIssues,
  stripMessage,
  stripReadme,
  stripRepository,
  stripRootContents,
  stripUser,
  stripWorkflowRuns,
} from './strip';

export const CAPTURE_SCRIPT_VERSION = '1.0.0';

/** The most requests one repository detail can need (design 3.2: 1 + 6 + 2). */
export const MAX_REQUESTS_PER_DETAIL = 9;

/** What the script needs from `fetch`. The global `fetch` fits this. */
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type CuratedList = {
  readonly owner: string;
  readonly repositories: readonly string[];
  /** Checked first: this repository must still have no README. */
  readonly noReadmeCheckFirst: string;
};

/** Bump when the checkpoint layout changes. A checkpoint with another version is refused. */
export const CHECKPOINT_VERSION = 1;

/** A checkpoint older than this is refused, so a snapshot never mixes very old responses. */
export const CHECKPOINT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const checkpointResponseSchema = z.object({ status: z.number().int(), body: z.unknown() });

/**
 * Progress of an unfinished capture. It holds only stripped responses (the same data the
 * snapshot keeps), so it carries no email, token or header.
 */
export const captureCheckpointSchema = z.object({
  version: z.literal(CHECKPOINT_VERSION),
  /** Time of the first run. Every run of one capture uses this value. */
  capturedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date'),
  captureScriptVersion: z.string().min(1),
  apiVersion: z.string().min(1),
  curatedRepositories: z.array(z.string().min(1)),
  /** Stripped responses by request URL. */
  responses: z.record(z.string(), checkpointResponseSchema),
});

export type CaptureCheckpoint = z.infer<typeof captureCheckpointSchema>;

/** Where unfinished progress is kept. `data` is the saved progress, or null for a new capture. */
export type CheckpointStore = {
  readonly data: CaptureCheckpoint | null;
  save(checkpoint: CaptureCheckpoint): Promise<void>;
};

/** Reads checkpoint text. Anything unreadable is refused, never partly used. */
export function parseCheckpoint(text: string): CaptureCheckpoint {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CaptureError(CHECKPOINT_UNUSABLE);
  }
  const parsed = captureCheckpointSchema.safeParse(json);
  if (!parsed.success) throw new CaptureError(CHECKPOINT_UNUSABLE);
  assertSafeToStore(text, null);
  return parsed.data;
}

const CHECKPOINT_UNUSABLE =
  'The saved capture progress cannot be used. Delete scripts/capture-demo/capture-progress.json to start again.';

export type CaptureOptions = {
  readonly fetchImpl: FetchLike;
  /** Optional. Turns on pause and resume (see the top of this file). */
  readonly checkpoint?: CheckpointStore;
  /** From `GITHUB_TOKEN`, or null. Only ever used for the Authorization header. */
  readonly token: string | null;
  readonly curated: CuratedList;
  readonly now: () => Date;
  readonly log: (message: string) => void;
};

export type CaptureResult = {
  readonly snapshot: DemoSnapshot;
  readonly requestsUsed: number;
  readonly remainingAfter: number | null;
};

/** A problem the user can read and act on. Its message never contains the token. */
export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureError';
  }
}

type RepositoryReference = { readonly owner: string; readonly repo: string; readonly fullName: string };

export function parseRepositoryReference(fullName: string): RepositoryReference {
  const parts = fullName.split('/');
  const [owner, repo] = parts;
  if (
    parts.length !== 2 ||
    owner === undefined ||
    repo === undefined ||
    !isValidUsername(owner) ||
    !isValidRepositoryName(repo)
  ) {
    throw new CaptureError(`"${fullName}" is not a valid owner/name.`);
  }
  return { owner, repo, fullName };
}

/** The number of requests the capture could use at most: every detail plus every profile. */
export function estimateMaxRequests(curated: CuratedList): number {
  const owners = new Set(curated.repositories.map((name) => parseRepositoryReference(name).owner.toLowerCase()));
  return curated.repositories.length * MAX_REQUESTS_PER_DETAIL + owners.size;
}

const SUCCESS = 200;

/**
 * A short, safe label for why a request failed, for example `cause code ENOTFOUND` or
 * `error TimeoutError`. Only a code made of capital letters, digits and underscores, or an
 * error name made of letters, is allowed through. Messages, headers and URLs are never used,
 * so the token cannot appear here.
 */
export function describeFailure(error: unknown): string {
  const cause = readField(error, 'cause');
  const code = readField(cause, 'code') ?? readField(error, 'code');
  if (typeof code === 'string' && /^[A-Z0-9_]{2,60}$/.test(code)) return `code ${code}`;
  const name = readField(error, 'name');
  if (typeof name === 'string' && /^[A-Za-z]{2,40}$/.test(name)) return `error ${name}`;
  return 'reason unknown';
}

/** Reads one field of a JSON object, or `undefined` when the value is not an object. */
function readField(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * The repository's official "owner/name". A stripped response has no `full_name`, so it is
 * rebuilt from the kept owner login and name. GitHub's own `full_name` is used when present.
 */
function officialName(raw: unknown): string | undefined {
  const fullName = readField(raw, 'full_name');
  if (typeof fullName === 'string') return fullName;
  const owner = readField(readField(raw, 'owner'), 'login');
  const name = readField(raw, 'name');
  return typeof owner === 'string' && typeof name === 'string' ? `${owner}/${name}` : undefined;
}

/** Statuses that are normal answers for an endpoint. Anything else stops the capture. */
function acceptedStatuses(endpointId: EndpointId): readonly number[] {
  switch (endpointId) {
    case 'readme':
      return [SUCCESS, 404]; // 404 means "no README found"
    case 'commits':
      return [SUCCESS, 409]; // 409 means an empty repository
    case 'root-contents':
      return [SUCCESS, 404]; // 404 is also how an empty repository answers
    default:
      return [SUCCESS];
  }
}

function stripBody(endpointId: EndpointId, status: number, body: unknown): unknown {
  if (status !== SUCCESS) return stripMessage(body);
  switch (endpointId) {
    case 'user':
      return stripUser(body);
    case 'repo':
      return stripRepository(body);
    case 'readme':
      return stripReadme(body);
    case 'commits':
      return stripCommits(body);
    case 'issues':
      return stripIssues(body);
    case 'branches':
      return stripBranches(body);
    case 'workflow-runs':
      return stripWorkflowRuns(body);
    case 'root-contents':
      return stripRootContents(body);
    default:
      throw new CaptureError(`The capture does not use the endpoint ${endpointId}.`);
  }
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const TOKEN_PATTERN = /(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]+/;

/** Throws when the serialised snapshot holds an email address or a token. */
export function assertSafeToStore(serialised: string, token: string | null): void {
  if (EMAIL_PATTERN.test(serialised)) {
    throw new CaptureError('The snapshot contains an email address. Nothing was written.');
  }
  if (TOKEN_PATTERN.test(serialised) || (token !== null && token !== '' && serialised.includes(token))) {
    throw new CaptureError('The snapshot contains a token. Nothing was written.');
  }
}

export async function captureDemoSnapshot(options: CaptureOptions): Promise<CaptureResult> {
  const { fetchImpl, token, curated, log, checkpoint } = options;
  const references = curated.repositories.map(parseRepositoryReference);
  const firstCheck = parseRepositoryReference(curated.noReadmeCheckFirst);
  if (!references.some((ref) => ref.fullName.toLowerCase() === firstCheck.fullName.toLowerCase())) {
    throw new CaptureError('The no-README check repository is not on the curated list.');
  }

  // Saved progress from an earlier run. It must belong to this same capture and be recent.
  const resumed = checkpoint?.data ?? null;
  if (resumed !== null) {
    const sameList =
      resumed.curatedRepositories.length === curated.repositories.length &&
      resumed.curatedRepositories.every((name, index) => name === curated.repositories[index]);
    const ageMs = options.now().getTime() - Date.parse(resumed.capturedAt);
    if (resumed.apiVersion !== GITHUB_API_VERSION || !sameList || ageMs > CHECKPOINT_MAX_AGE_MS || ageMs < 0) {
      throw new CaptureError(
        'The saved capture progress does not match this capture, or is older than 24 hours. ' +
          'Delete scripts/capture-demo/capture-progress.json to start again.',
      );
    }
  }

  // The first run's time is kept for every run, so the 12-month window never changes.
  const startedAt = resumed !== null ? new Date(resumed.capturedAt) : options.now();
  const capturedAt = startedAt.toISOString();
  const windowStart = activityWindowStart(startedAt);
  const savedResponses = new Map<string, StoredResponse>(resumed !== null ? Object.entries(resumed.responses) : []);

  let requestsUsed = 0;
  let remaining: number | null = null;
  let resetAt: string | null = null;
  const answers = new Map<string, StoredResponse & { raw: unknown }>();

  /** Stops with a clear message. With a checkpoint the progress is already saved, so it is a pause. */
  function stopForLookups(detail: string): never {
    const when = resetAt ? ` after ${resetAt}` : ' later';
    if (checkpoint !== undefined) {
      throw new CaptureError(
        `Paused: ${detail} ${savedResponses.size} responses are saved. Run the same command again${when}. No snapshot was written.`,
      );
    }
    throw new CaptureError(`${detail}${resetAt ? ` Try again after ${resetAt}.` : ''} Nothing was written.`);
  }

  /** One GitHub request, through the catalogue. The same URL is never requested twice. */
  async function request(
    endpointId: EndpointId,
    pathValues: PathValues,
    query: QueryValues = {},
  ): Promise<StoredResponse & { raw: unknown }> {
    const built = buildGitHubUrl(endpointId, pathValues, query);
    if (!built.ok) throw new CaptureError(`Request refused by the catalogue: ${built.reason}`);
    const known = answers.get(built.url);
    if (known !== undefined) return known;

    // Saved by an earlier run: no request is sent and no lookup is used.
    const saved = savedResponses.get(built.url);
    if (saved !== undefined) {
      const reused = { status: saved.status, body: saved.body, raw: saved.body };
      answers.set(built.url, reused);
      return reused;
    }

    if (remaining !== null && remaining <= 0) {
      stopForLookups('GitHub allows no more lookups right now.');
    }

    const headers: Record<string, string> = {
      Accept: GITHUB_ACCEPT_HEADER,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': 'graverepo-demo-capture',
    };
    if (token !== null && token !== '') headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetchImpl(built.url, { headers, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      // The underlying error can mention request details, so it is not passed on. Only a short
      // code or error name is added for debugging (see `describeFailure`).
      throw new CaptureError(
        `The request for ${endpointId} did not complete. Check the connection. (${describeFailure(error)})`,
      );
    }
    requestsUsed += 1;

    const remainingHeader = response.headers.get('x-ratelimit-remaining');
    const resetHeader = response.headers.get('x-ratelimit-reset');
    if (remainingHeader !== null && /^\d+$/.test(remainingHeader)) remaining = Number(remainingHeader);
    if (resetHeader !== null && /^\d+$/.test(resetHeader)) {
      resetAt = new Date(Number(resetHeader) * 1000).toISOString();
    }

    if (response.status === 403 || response.status === 429) {
      if (checkpoint !== undefined) {
        stopForLookups(`GitHub refused the ${endpointId} request (status ${response.status}), probably a rate limit.`);
      }
      throw new CaptureError(
        `GitHub refused the ${endpointId} request (status ${response.status}), probably a rate limit.${
          resetAt ? ` Lookups reset at ${resetAt}.` : ''
        } Nothing was written.`,
      );
    }
    if (!acceptedStatuses(endpointId).includes(response.status)) {
      throw new CaptureError(
        `Unexpected status ${response.status} for ${endpointId} (${built.url}). Nothing was written.`,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await response.text());
    } catch {
      throw new CaptureError(`GitHub's ${endpointId} answer was not valid JSON. Nothing was written.`);
    }
    const stored = { status: response.status, body: stripBody(endpointId, response.status, raw), raw };
    answers.set(built.url, stored);

    // Keep the stripped response, so a pause or a crash loses nothing already fetched.
    if (checkpoint !== undefined) {
      savedResponses.set(built.url, { status: stored.status, body: stored.body });
      const progress: CaptureCheckpoint = {
        version: CHECKPOINT_VERSION,
        capturedAt,
        captureScriptVersion: CAPTURE_SCRIPT_VERSION,
        apiVersion: GITHUB_API_VERSION,
        curatedRepositories: [...curated.repositories],
        responses: Object.fromEntries(savedResponses),
      };
      assertSafeToStore(JSON.stringify(progress), token);
      await checkpoint.save(progress);
    }
    return stored;
  }

  const toStored = (answer: StoredResponse): StoredResponse => ({ status: answer.status, body: answer.body });

  // 1. The no-README state is confirmed before anything else is captured.
  log(`Token: ${token !== null && token !== '' ? 'in use' : 'not set (unauthenticated)'}`);
  if (resumed !== null) {
    log(`Resuming: ${savedResponses.size} saved responses are reused. capturedAt stays ${capturedAt}.`);
  }
  log(`Checking that ${firstCheck.fullName} still has no README…`);
  const firstReadme = await request('readme', { owner: firstCheck.owner, repo: firstCheck.repo });
  if (firstReadme.status !== 404) {
    throw new CaptureError(
      `${firstCheck.fullName} now has a README, so the "without a README" state would be lost. ` +
        'STOP: nothing else was captured or written. Decide how to continue before running again.',
    );
  }
  log('Confirmed: no README. Continuing.');

  // 2. Make sure there are enough lookups for the whole run before spending them.
  const estimate = estimateMaxRequests(curated);
  // A resumable run has no up-front allowance check: it pauses when the lookups run out.
  if (checkpoint === undefined && remaining !== null && remaining < estimate - requestsUsed) {
    throw new CaptureError(
      `GitHub reports ${remaining} lookups left, and the capture may need up to ${estimate}. ` +
        `Set GITHUB_TOKEN to raise the allowance${resetAt ? `, or wait until ${resetAt}` : ''}. Nothing was written.`,
    );
  }

  // 3. Profiles, owner first.
  // One profile per source account, in the order the accounts first appear on the list.
  const accounts: string[] = [];
  for (const ref of references) {
    if (!accounts.some((login) => login.toLowerCase() === ref.owner.toLowerCase())) {
      accounts.push(ref.owner);
    }
  }
  if (!accounts.some((login) => login.toLowerCase() === curated.owner.toLowerCase())) {
    throw new CaptureError(`The demo owner ${curated.owner} has no repository on the curated list.`);
  }
  const users: Record<string, StoredResponse> = {};
  for (const login of accounts) {
    const answer = await request('user', { owner: login });
    users[login] = toStored(answer);
    log(`Profile captured: ${login}`);
  }

  // 4. Repository details.
  const repositories: DemoSnapshot['repositories'] = [];
  for (const ref of references) {
    const before = requestsUsed;
    const path: PathValues = { owner: ref.owner, repo: ref.repo };

    const repo = await request('repo', path);
    const official = officialName(repo.raw);
    if (official === undefined || official.toLowerCase() !== ref.fullName.toLowerCase()) {
      throw new CaptureError(`${ref.fullName} is now reported as a different repository. Nothing was written.`);
    }
    const hasIssues = readField(repo.raw, 'has_issues');

    const readme = await request('readme', path);
    const latestCommit = await request('commits', path, { per_page: 1 });
    const issues =
      hasIssues === false
        ? null
        : await request('issues', path, {
            state: 'open',
            sort: 'created',
            direction: 'asc',
            per_page: 100,
          });
    const branches = await request('branches', path, { per_page: 100 });
    const ci = await request('workflow-runs', path, { per_page: 1 });
    const rootContents = await request('root-contents', path);

    // Step 3 of the detail runner: the same rules the loader uses.
    const asLike = (answer: StoredResponse) => ({ status: answer.status, headers: {}, body: answer.body });
    const plan = planDependentRequests(
      { latestCommit: asLike(latestCommit), rootContents: asLike(rootContents) },
      windowStart,
    );
    const recentAuthors = plan.needsRecentAuthors
      ? await request('commits', path, { since: windowStart, per_page: 100 })
      : null;
    const manifestCommit =
      plan.manifestFileName !== null
        ? await request('commits', path, { path: plan.manifestFileName, per_page: 1 })
        : null;

    const responses: RepositoryResponses = {
      repo: toStored(repo),
      readme: toStored(readme),
      latestCommit: toStored(latestCommit),
      issues: issues && toStored(issues),
      branches: toStored(branches),
      ci: toStored(ci),
      rootContents: toStored(rootContents),
      recentAuthors: recentAuthors && toStored(recentAuthors),
      manifestCommit: manifestCommit && toStored(manifestCommit),
    };
    repositories.push({ fullName: ref.fullName, responses });
    log(`Captured ${ref.fullName} (${requestsUsed - before} requests).`);
  }

  const snapshot: DemoSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    capturedAt,
    captureScriptVersion: CAPTURE_SCRIPT_VERSION,
    apiVersion: GITHUB_API_VERSION,
    sourceAccounts: accounts,
    curatedRepositories: [...curated.repositories],
    users,
    repositories,
  };

  // 5. Final checks. A failed check means nothing is returned, so nothing can be written.
  const built = buildDemoGraveyard(snapshot);
  if (!built.ok) {
    throw new CaptureError(`The captured data failed validation: ${built.problems.join('; ')}`);
  }
  const missing = uncoveredStates(built.graveyard.details, built.windowStart);
  if (missing.length > 0) {
    const names = REQUIRED_STATES.filter((state) => missing.includes(state.number))
      .map((state) => `${state.number} ${state.label}`)
      .join(', ');
    throw new CaptureError(`These required states are not shown by the captured data: ${names}. Nothing was written.`);
  }
  assertSafeToStore(JSON.stringify(snapshot), token);

  log(`All ${REQUIRED_STATES.length} required states are shown. Requests used: ${requestsUsed}.`);
  return { snapshot, requestsUsed, remainingAfter: remaining };
}
