// Types for the Resurrection Ritual domain (resurrection-ritual task 2.1, design 4.1, 7.1).
// Types only. No Zod here: runtime validation of saved progress lives in the state layer.
// The domain imports data-layer types only (Req 10.1).
import type {
  BranchesValue,
  CiValue,
  LatestCommitValue,
  ManifestValue,
  OldestOpenIssue,
  ReadmeValue,
  RecentAuthorsValue,
} from '../data/github/types';

/** A raw field of the detail and the value read from it. Never a derived value (Req 2.4). */
export type Evidence = {
  /** A path into the detail, such as `core.pushedAt`, `renamedFrom` or `sections.readme`. */
  readonly field: string;
  readonly value: unknown;
};

/** A value GRAVEREPO calculates from evidence. Always labelled as derived (Req 2.4). */
export type DerivedValue = {
  readonly name: string;
  readonly value: number | string | null;
  /** The evidence fields the value was calculated from. */
  readonly computedFrom: readonly string[];
  readonly referenceTime: string;
};

export type FindingId =
  | 'renamed'
  | 'archived'
  | 'empty'
  | 'last-update'
  | 'latest-commit'
  | 'fork'
  | 'readme'
  | 'open-issues'
  | 'oldest-open-issue'
  | 'recent-authors'
  | 'branches'
  | 'ci'
  | 'dependency-file';

/** The structured value of each finding, read from the detail and never invented. */
export type FindingValues = {
  readonly renamed: { readonly renamedFrom: string; readonly owner: string; readonly name: string };
  readonly archived: { readonly isArchived: true };
  readonly empty: { readonly isEmpty: true };
  readonly 'last-update': { readonly pushedAt: string };
  readonly 'latest-commit': LatestCommitValue;
  readonly fork: { readonly isFork: true };
  readonly readme: ReadmeValue;
  readonly 'open-issues': {
    readonly count: number;
    readonly isLowerBound: boolean;
    readonly issuesPageUrl: string;
  };
  readonly 'oldest-open-issue': OldestOpenIssue;
  readonly 'recent-authors': RecentAuthorsValue;
  readonly branches: BranchesValue;
  readonly ci: CiValue;
  readonly 'dependency-file': ManifestValue;
};

export type FindingState = 'available' | 'unavailable' | 'not-applicable';
export type FindingRole = 'actionable' | 'informational';
/** Why an informational or unavailable finding does not lead to a step (Req 4.2). */
export type InformationalReason = 'fact-only' | 'no-action-needed' | 'not-applicable' | 'unavailable';

export type Finding<K extends FindingId = FindingId> = {
  readonly id: K;
  readonly state: FindingState;
  /** For `unavailable` and `not-applicable`: the data layer's reason, carried as given. Otherwise null. */
  readonly reason: string | null;
  /** Present only when `state` is `available`. */
  readonly value: FindingValues[K] | null;
  /** True when the data layer marked the count "at least" (Req 2.11). */
  readonly isLowerBound: boolean;
  readonly role: FindingRole;
  readonly informationalReason: InformationalReason | null;
  /** Never empty (Req 2.3, 2.5). */
  readonly evidence: readonly Evidence[];
  readonly derived: readonly DerivedValue[];
};

export type AnyFinding = { [K in FindingId]: Finding<K> }[FindingId];

export type ConditionId =
  | 'archived'
  | 'empty'
  | 'last-update-unknown'
  | 'recently-updated'
  | 'resting'
  | 'dormant';

/** The three raw fields the condition needs. From a detail, or from a tombstone summary (O18). */
export type ConditionInput = {
  readonly isArchived: boolean;
  /** `true`, `false`, or `null` when unknown. An unknown value never gives `empty`. */
  readonly isEmpty: boolean | null;
  readonly pushedAt: string | null;
};

export type Condition = {
  readonly id: ConditionId;
  readonly kind: 'interpretation';
  readonly basedOn: readonly Evidence[];
  /** Display-only whole months, or null. It never decides the condition (Req 3.3). */
  readonly ageMonths: number | null;
};

export type PlanRuleId =
  | 'review-archived'
  | 'add-first-commit'
  | 'add-readme'
  | 'review-latest-commit'
  | 'check-dependencies'
  | 'check-workflow-run'
  | 'review-open-issues';

export type PlanItem = {
  /** Equals the rule ID, so the same item has the same ID on every run (design 5.2). */
  readonly id: PlanRuleId;
  readonly position: number;
  readonly findingId: FindingId;
  /** Copied from the finding, not recalculated (Req 5.4). */
  readonly evidence: readonly Evidence[];
  readonly derived: readonly DerivedValue[];
  /** The observed fact the step is based on, as data. The wording module turns it into text. */
  readonly because: Readonly<Record<string, string | number | boolean | null>>;
  /** Data the suggested step needs, for example the dependency file name. */
  readonly step: Readonly<Record<string, string | number | boolean | null>>;
  readonly required: boolean;
};

export type Plan = {
  readonly items: readonly PlanItem[];
  /** True for an archived repository: the steps are suggestions only (Req 5.14). */
  readonly isArchived: boolean;
  /** Findings whose sections couldn't be checked. No suggestion comes from them (Req 5.12). */
  readonly unavailableFindingIds: readonly FindingId[];
};

export type NecropsyResult = {
  /** In catalogue order (design 4.2). Switched-off sections leave no trace. */
  readonly findings: readonly AnyFinding[];
  readonly condition: Condition;
  readonly plan: Plan;
  readonly referenceTime: string;
};

export type Stage = 'necropsy' | 'plan' | 'rising' | 'living';
export type ProgressSource = 'demo' | 'live';

/** Design 7.1. The record written when the visitor marks a repository as revived (local only). */
export type RevivedRecord = {
  readonly owner: string;
  readonly repo: string;
  readonly url: string;
  readonly wasArchived: boolean;
  readonly source: ProgressSource;
  readonly evidenceFetchedAt: string;
  readonly requiredCount: number;
  readonly revivedAt: string;
};

/** Design 7.1. One entry per repository per source. One `schemaVersion` covers the whole entry. */
export type RitualProgress = {
  readonly schemaVersion: 1;
  readonly stage: Stage;
  readonly tickedItemIds: readonly string[];
  readonly evidenceFetchedAt: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly revived: RevivedRecord | null;
};

/** Locale and time zone for formatting dates for people (O21). Supplied from outside the domain. */
export type DisplayContext = {
  readonly locale: string;
  readonly timeZone: string;
};
