// Turns a demo snapshot into the demo graveyard, using the same schemas and adapters as
// live data (Requirement 8.11). Any problem makes the whole snapshot unusable (Requirement 8.12):
// the demo never shows partly valid data. It sends no request and never throws.
import { adaptUser } from '../github/adapters/user';
import { activityWindowStart, assembleDetail } from '../github/detail-assembly';
import type { HttpResponseLike } from '../github/http-response';
import type { DemoGraveyard, RepositoryDetail, UserProfile } from '../github/types';
import { demoSnapshotSchema, type DemoSnapshot, type StoredResponse } from './snapshot-schema';

export type BuildDemoGraveyardResult =
  | {
      readonly ok: true;
      readonly graveyard: DemoGraveyard;
      /** Start of the 12-month window, counted from the capture date. */
      readonly windowStart: string;
    }
  | { readonly ok: false; readonly problems: readonly string[] };

function asHttpResponse(stored: StoredResponse): HttpResponseLike {
  return { status: stored.status, headers: {}, body: stored.body };
}

function sectionProblems(detail: RepositoryDetail): string[] {
  const problems: string[] = [];
  for (const [name, section] of Object.entries(detail.sections)) {
    // `not-applicable` is a real answer (for example issues turned off). `unavailable` is not.
    if (section.status === 'unavailable') {
      problems.push(`${detail.core.fullName}: section "${name}" is unavailable (${section.reason})`);
    }
  }
  return problems;
}

export function buildDemoGraveyard(raw: unknown): BuildDemoGraveyardResult {
  const parsed = demoSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: ['The snapshot does not match the expected layout.'] };
  }
  const snapshot: DemoSnapshot = parsed.data;
  const problems: string[] = [];
  const windowStart = activityWindowStart(new Date(snapshot.capturedAt));

  const sourceAccounts: UserProfile[] = [];
  for (const login of snapshot.sourceAccounts) {
    const stored = snapshot.users[login];
    if (stored === undefined || stored.status !== 200) {
      problems.push(`Profile for ${login} is missing or not a successful response.`);
      continue;
    }
    const user = adaptUser(stored.body);
    if (!user.ok) {
      problems.push(`Profile for ${login} could not be read.`);
    } else if (user.value.login.toLowerCase() !== login.toLowerCase()) {
      problems.push(`Profile for ${login} belongs to ${user.value.login}.`);
    } else {
      sourceAccounts.push(user.value);
    }
  }

  const details: RepositoryDetail[] = [];
  for (const entry of snapshot.repositories) {
    const result = assembleDetail(
      {
        repo: asHttpResponse(entry.responses.repo),
        readme: asHttpResponse(entry.responses.readme),
        latestCommit: asHttpResponse(entry.responses.latestCommit),
        issues: entry.responses.issues && asHttpResponse(entry.responses.issues),
        branches: asHttpResponse(entry.responses.branches),
        ci: asHttpResponse(entry.responses.ci),
        rootContents: asHttpResponse(entry.responses.rootContents),
        recentAuthors: entry.responses.recentAuthors && asHttpResponse(entry.responses.recentAuthors),
        manifestCommit: entry.responses.manifestCommit && asHttpResponse(entry.responses.manifestCommit),
      },
      windowStart,
      entry.fullName,
    );
    if (!result.ok) {
      problems.push(`${entry.fullName}: core metadata could not be read (${result.error.kind}).`);
      continue;
    }
    const detail = result.value;
    if (detail.renamedFrom !== null) {
      problems.push(`${entry.fullName}: GitHub reports the name ${detail.core.fullName}.`);
    }
    problems.push(...sectionProblems(detail));
    details.push(detail);
  }

  // Every curated repository must be present exactly once, and nothing else may be.
  const present = details.map((detail) => detail.core.fullName.toLowerCase());
  const wanted = snapshot.curatedRepositories.map((name) => name.toLowerCase());
  for (const name of wanted) {
    if (!present.includes(name)) problems.push(`Curated repository ${name} has no detail.`);
  }
  for (const name of present) {
    if (!wanted.includes(name)) problems.push(`Repository ${name} is not on the curated list.`);
  }
  if (new Set(present).size !== present.length) problems.push('A repository appears twice.');

  // Each source account must own at least one repository, and every owner must be a source.
  const owners = new Set(details.map((detail) => detail.core.owner.toLowerCase()));
  const accounts = new Set(snapshot.sourceAccounts.map((login) => login.toLowerCase()));
  for (const owner of owners) {
    if (!accounts.has(owner)) problems.push(`Owner ${owner} is not a source account.`);
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    windowStart,
    graveyard: {
      capturedAt: snapshot.capturedAt,
      sourceAccounts,
      repositories: details.map((detail) => detail.core),
      details,
    },
  };
}
