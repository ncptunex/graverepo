// Keeps only the fields GRAVEREPO reads from each GitHub response (design 4.8: "unused fields
// stripped"). Every value kept is the value GitHub returned. Nothing is added or changed.
// Email fields are never on the list, so they cannot be kept (Requirement 13.1, 13.4).
//
// A test checks that an adapter gives the same result for a captured response before and
// after stripping, so a field the adapters read can't be dropped by mistake.

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Copies the listed keys that are present. A key that is absent stays absent. */
function pick(source: unknown, keys: readonly string[]): UnknownRecord {
  if (!isRecord(source)) return {};
  const result: UnknownRecord = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
  }
  return result;
}

/** Applies `projection` to each item of a list. A body that is not a list is returned as `null`. */
function mapList(body: unknown, projection: (item: unknown) => unknown): unknown {
  return Array.isArray(body) ? body.map(projection) : null;
}

export function stripUser(body: unknown): unknown {
  return pick(body, ['login', 'name', 'avatar_url', 'html_url', 'type', 'public_repos']);
}

export function stripRepository(body: unknown): unknown {
  const stripped = pick(body, [
    'id',
    'name',
    'html_url',
    'private',
    'visibility',
    'fork',
    'archived',
    'description',
    'language',
    'stargazers_count',
    'forks_count',
    'open_issues_count',
    'has_issues',
    'default_branch',
    'created_at',
    'pushed_at',
    'size',
  ]);
  if (isRecord(body) && isRecord(body.owner)) stripped.owner = pick(body.owner, ['login']);
  return stripped;
}

export function stripReadme(body: unknown): unknown {
  return pick(body, ['html_url']);
}

function stripCommit(item: unknown): unknown {
  const stripped = pick(item, ['sha', 'html_url']);
  if (isRecord(item) && isRecord(item.commit)) {
    const commit: UnknownRecord = {};
    if (isRecord(item.commit.committer)) commit.committer = pick(item.commit.committer, ['date']);
    if (isRecord(item.commit.author)) commit.author = pick(item.commit.author, ['name']);
    stripped.commit = commit;
  }
  if (isRecord(item) && isRecord(item.author)) stripped.author = pick(item.author, ['login']);
  return stripped;
}

export function stripCommits(body: unknown): unknown {
  return mapList(body, stripCommit);
}

function stripIssue(item: unknown): unknown {
  const stripped = pick(item, ['number', 'html_url', 'created_at']);
  // Only whether an item is a pull request matters. Its details are not kept.
  if (isRecord(item) && isRecord(item.pull_request)) stripped.pull_request = {};
  return stripped;
}

export function stripIssues(body: unknown): unknown {
  return mapList(body, stripIssue);
}

export function stripBranches(body: unknown): unknown {
  return mapList(body, (item) => pick(item, ['name']));
}

export function stripWorkflowRuns(body: unknown): unknown {
  const stripped = pick(body, ['total_count']);
  if (isRecord(body) && Array.isArray(body.workflow_runs)) {
    stripped.workflow_runs = body.workflow_runs.map((run) =>
      pick(run, ['html_url', 'conclusion', 'created_at']),
    );
  }
  return stripped;
}

export function stripRootContents(body: unknown): unknown {
  return mapList(body, (item) => pick(item, ['name', 'type']));
}

/** Error and "not found" responses keep only GitHub's message text. */
export function stripMessage(body: unknown): unknown {
  return pick(body, ['message']);
}
