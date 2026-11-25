// Necropsy findings (tasks 3.1–3.4, design 4.2 and 4.4; Req 2, 4).
// `buildFindings` turns a detail and a reference time into findings in catalogue order.
// - Every finding carries raw evidence. Calculated values are listed separately as derived.
// - Unknown stays unknown: an unavailable section or a null field never becomes 0 or "none".
// - A finding that has nothing to report is omitted. A section switched off by configuration
//   (`section-disabled`) is omitted too: no finding, no wording, no plan item (Req 2.8).
// - Only an `available` finding can be actionable (Req 4.3).
// The function is pure. It reads no clock.
import { ROLE_AGE_MONTHS } from './config';
import { ageInMonths, isOlderThanMonths } from './dates';
import type {
  AnyFinding,
  DerivedValue,
  Evidence,
  Finding,
  FindingId,
  FindingValues,
  InformationalReason,
} from './types';
import type { FieldResult, RepositoryDetail } from '../data/github/types';

type Extras = {
  readonly isLowerBound?: boolean;
  readonly derived?: readonly DerivedValue[];
};

function available<K extends FindingId>(
  id: K,
  value: FindingValues[K],
  evidence: readonly Evidence[],
  role: 'actionable' | 'informational',
  informationalReason: InformationalReason | null,
  extras: Extras = {},
): Finding<K> {
  return {
    id,
    state: 'available',
    reason: null,
    value,
    isLowerBound: extras.isLowerBound ?? false,
    role,
    informationalReason: role === 'actionable' ? null : informationalReason,
    evidence,
    derived: extras.derived ?? [],
  };
}

function notAvailable<K extends FindingId>(
  id: K,
  state: 'unavailable' | 'not-applicable',
  reason: string | null,
  evidence: readonly Evidence[],
): Finding<K> {
  return {
    id,
    state,
    reason,
    value: null,
    isLowerBound: false,
    role: 'informational',
    informationalReason: state === 'unavailable' ? 'unavailable' : 'not-applicable',
    evidence,
    derived: [],
  };
}

function ageDerived(date: string, computedFrom: string, referenceTime: string): DerivedValue {
  return { name: 'ageMonths', value: ageInMonths(date, referenceTime), computedFrom: [computedFrom], referenceTime };
}

/**
 * The common handling of a section: unavailable, not-applicable (with the reasons the data layer
 * can give for it), unexpected reasons, and a switched-off optional section.
 * Returns `undefined` when the finding is omitted, `null` when the section is available.
 */
function unavailableOrOmitted<K extends FindingId, V>(
  id: K,
  section: FieldResult<V>,
  evidence: readonly Evidence[],
  options: { readonly optional: boolean; readonly notApplicableReasons: readonly string[] },
): Finding<K> | undefined | null {
  if (section.status === 'available') return null;
  if (section.status === 'unavailable') return notAvailable(id, 'unavailable', section.reason, evidence);
  // `section-disabled` on an optional section is a configuration choice: omit the finding.
  if (options.optional && section.reason === 'section-disabled') return undefined;
  // A reason that the data layer is not expected to give for this section is not trusted:
  // the finding is unavailable and the reason is carried as given (design 4.2).
  if (!options.notApplicableReasons.includes(section.reason)) {
    return notAvailable(id, 'unavailable', section.reason, evidence);
  }
  return notAvailable(id, 'not-applicable', section.reason, evidence);
}

export function buildFindings(detail: RepositoryDetail, referenceTime: string): AnyFinding[] {
  const { core, sections } = detail;
  const findings: AnyFinding[] = [];
  const push = (finding: AnyFinding | undefined | null) => {
    if (finding) findings.push(finding);
  };

  // 1. renamed
  if (detail.renamedFrom !== null) {
    push(
      available(
        'renamed',
        { renamedFrom: detail.renamedFrom, owner: core.owner, name: core.name },
        [
          { field: 'renamedFrom', value: detail.renamedFrom },
          { field: 'core.owner', value: core.owner },
          { field: 'core.name', value: core.name },
        ],
        'informational',
        'fact-only',
      ),
    );
  }

  // 2. archived
  if (core.isArchived) {
    push(
      available('archived', { isArchived: true }, [{ field: 'core.isArchived', value: true }], 'actionable', null),
    );
  }

  // 3. empty
  if (detail.isEmpty) {
    push(available('empty', { isEmpty: true }, [{ field: 'isEmpty', value: true }], 'actionable', null));
  }

  // 4. last-update (the core `pushedAt`, O3)
  const pushedAtEvidence: Evidence = { field: 'core.pushedAt', value: core.pushedAt };
  const lastUpdateAvailable = core.pushedAt !== null;
  if (core.pushedAt === null) {
    push(notAvailable('last-update', 'unavailable', null, [pushedAtEvidence]));
  } else {
    push(
      available('last-update', { pushedAt: core.pushedAt }, [pushedAtEvidence], 'informational', 'fact-only', {
        derived: [ageDerived(core.pushedAt, 'core.pushedAt', referenceTime)],
      }),
    );
  }

  // 5. latest-commit (core section). `core.pushedAt` is evidence of availability only (O24).
  const latestEvidence: Evidence[] = [{ field: 'sections.latestCommit', value: sections.latestCommit }, pushedAtEvidence];
  const latestOther = unavailableOrOmitted('latest-commit', sections.latestCommit, latestEvidence, {
    optional: false,
    notApplicableReasons: ['empty-repository'],
  });
  if (latestOther !== null) {
    push(latestOther);
  } else if (sections.latestCommit.status === 'available') {
    const commit = sections.latestCommit.value;
    // Actionable only when both findings are available and the latest commit date is older
    // than 12 months. The rule uses the commit date, never `pushedAt`.
    const actionable = lastUpdateAvailable && isOlderThanMonths(commit.date, ROLE_AGE_MONTHS, referenceTime);
    push(
      available(
        'latest-commit',
        commit,
        latestEvidence,
        actionable ? 'actionable' : 'informational',
        lastUpdateAvailable ? 'no-action-needed' : 'fact-only',
        { derived: [ageDerived(commit.date, 'sections.latestCommit', referenceTime)] },
      ),
    );
  }

  // 6. fork
  if (core.isFork) {
    push(available('fork', { isFork: true }, [{ field: 'core.isFork', value: true }], 'informational', 'fact-only'));
  }

  // 7. readme (core section)
  const readmeEvidence: Evidence[] = [{ field: 'sections.readme', value: sections.readme }];
  const readmeOther = unavailableOrOmitted('readme', sections.readme, readmeEvidence, {
    optional: false,
    notApplicableReasons: [],
  });
  if (readmeOther !== null) {
    push(readmeOther);
  } else if (sections.readme.status === 'available') {
    const readme = sections.readme.value;
    push(
      available('readme', readme, readmeEvidence, readme.found ? 'informational' : 'actionable', 'no-action-needed'),
    );
  }

  // 8. open-issues, and 9. oldest-open-issue (core section)
  const issuesEvidence: Evidence[] = [{ field: 'sections.openIssues', value: sections.openIssues }];
  const issuesOther = unavailableOrOmitted('open-issues', sections.openIssues, issuesEvidence, {
    optional: false,
    notApplicableReasons: ['issues-disabled'],
  });
  if (issuesOther !== null) {
    push(issuesOther);
  } else if (sections.openIssues.status === 'available') {
    const issues = sections.openIssues.value;
    const value = { count: issues.count, isLowerBound: issues.isLowerBound, issuesPageUrl: issues.issuesPageUrl };
    if (issues.count >= 1) {
      push(available('open-issues', value, issuesEvidence, 'actionable', null, { isLowerBound: issues.isLowerBound }));
      // The oldest issue is omitted when the data layer has none to report.
      if (issues.oldest !== null) {
        push(available('oldest-open-issue', issues.oldest, issuesEvidence, 'informational', 'fact-only'));
      }
    } else {
      // Count 0 with a lower bound can't rule issues out, so no conclusion is drawn (Req 2.12).
      push(
        available(
          'open-issues',
          value,
          issuesEvidence,
          'informational',
          issues.isLowerBound ? 'fact-only' : 'no-action-needed',
          { isLowerBound: issues.isLowerBound },
        ),
      );
    }
  }

  // 10. recent-authors (optional section)
  const authorsEvidence: Evidence[] = [{ field: 'sections.recentAuthors', value: sections.recentAuthors }];
  const authorsOther = unavailableOrOmitted('recent-authors', sections.recentAuthors, authorsEvidence, {
    optional: true,
    notApplicableReasons: ['empty-repository'],
  });
  if (authorsOther !== null) {
    push(authorsOther);
  } else if (sections.recentAuthors.status === 'available') {
    const authors = sections.recentAuthors.value;
    push(
      available('recent-authors', authors, authorsEvidence, 'informational', 'fact-only', {
        isLowerBound: authors.isLowerBound,
      }),
    );
  }

  // 11. branches (optional section)
  const branchesEvidence: Evidence[] = [{ field: 'sections.branches', value: sections.branches }];
  const branchesOther = unavailableOrOmitted('branches', sections.branches, branchesEvidence, {
    optional: true,
    notApplicableReasons: [],
  });
  if (branchesOther !== null) {
    push(branchesOther);
  } else if (sections.branches.status === 'available') {
    const branches = sections.branches.value;
    push(
      available('branches', branches, branchesEvidence, 'informational', 'fact-only', {
        isLowerBound: branches.isLowerBound,
      }),
    );
  }

  // 12. ci (optional section). Only a latest run that ended in `failure` is actionable (O4).
  const ciEvidence: Evidence[] = [{ field: 'sections.ci', value: sections.ci }];
  const ciOther = unavailableOrOmitted('ci', sections.ci, ciEvidence, {
    optional: true,
    notApplicableReasons: [],
  });
  if (ciOther !== null) {
    push(ciOther);
  } else if (sections.ci.status === 'available') {
    const ci = sections.ci.value;
    const failed = ci.found && ci.conclusion === 'failure';
    push(available('ci', ci, ciEvidence, failed ? 'actionable' : 'informational', 'no-action-needed'));
  }

  // 13. dependency-file (optional section)
  const manifestEvidence: Evidence[] = [{ field: 'sections.manifest', value: sections.manifest }];
  const manifestOther = unavailableOrOmitted('dependency-file', sections.manifest, manifestEvidence, {
    optional: true,
    notApplicableReasons: ['empty-repository'],
  });
  if (manifestOther !== null) {
    push(manifestOther);
  } else if (sections.manifest.status === 'available') {
    const manifest = sections.manifest.value;
    const changedAt = manifest.lastChangedAt;
    const found = manifest.fileName !== null;
    // Without a last-change date no conclusion can be drawn, so the finding is fact-only.
    const actionable = found && changedAt !== null && isOlderThanMonths(changedAt, ROLE_AGE_MONTHS, referenceTime);
    const reason: InformationalReason = found && changedAt === null ? 'fact-only' : 'no-action-needed';
    push(
      available('dependency-file', manifest, manifestEvidence, actionable ? 'actionable' : 'informational', reason, {
        derived: changedAt !== null ? [ageDerived(changedAt, 'sections.manifest', referenceTime)] : [],
      }),
    );
  }

  return findings;
}
