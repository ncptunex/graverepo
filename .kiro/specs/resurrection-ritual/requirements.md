# Requirements: resurrection-ritual

**Status:** Draft for review (third revision, approvals recorded). Items marked **Open** or **Proposed** need your approval before implementation. See the decision list at the end. Approved in this revision: O15, O17, O18, O19, O21, O22, O23 and O24, and O20 retained as specified (see "Approved in this revision"). Other Proposed items are unchanged.

## Introduction

The Resurrection Ritual is GRAVEREPO's main experience. A visitor opens a repository's tombstone and walks through four stages:

1. **Necropsy.** GRAVEREPO shows what can be observed about the repository on GitHub, as honest, evidence-based findings.
2. **Plan.** GRAVEREPO turns the actionable findings into a short, ordered checklist of suggested steps.
3. **Rising.** The visitor ticks off steps. Progress reflects the ticks, and nothing else.
4. **The Living.** When every required step is ticked, the visitor can mark the repository as revived. This is saved in the browser only.

The ritual **reads** GitHub data through the approved data layer and **never changes** anything on GitHub. "Revived" means the visitor finished the local ritual (voice rule 10). It says nothing about the GitHub repository's actual status.

This spec covers: signals (findings), repository conditions, plan rules, the Rising, The Living and saved progress (D25). It also covers the behaviour and content of the four stage screens. It does not cover:

- fetching, caching or validating GitHub data (`github-data-layer`);
- the landing screen, search, the tombstone list and the demo button (`graveyard-dashboard`);
- Lantern Mode (`lantern-mode`);
- colours, fonts, mascots and icons (`design-system.md`, still open);
- optional extras: obituary card, time-lapse, branch dates, registry checks (roadmap priority 6).

The schedule, priorities and checkpoint are in [`docs/roadmap.md`](../../../docs/roadmap.md). Wording rules are in `.kiro/steering/voice-and-honesty.md`. Layer rules are in `.kiro/steering/tech.md`.

### Priority and cut order

The ritual is roadmap priority 1. Inside this spec, when time is short, higher items win:

1. Necropsy findings, plan rules and progress logic with their property tests.
2. Saved progress and the four screens working on the demo graveyard (checkpoint checks 2 and 3).
3. Live detail wired into the ritual, with errors and cancellation.
4. Keyboard path and reduced motion (checkpoint check 6).
5. Garden pictures, starting static, and only after O12 is approved. Animation only after the core journey works, and each animation needs a reduced-motion version.

No additional GitHub analysis is added before the checkpoint (D26). The ritual uses only fields the data layer already provides.

### Reused decisions

| Decision | Used for |
|---|---|
| D5, D15 | Root-folder manifest detection, 12-month activity window |
| D14 | Authors identified by login or name, never email |
| D6 | `localStorage` as browser storage |
| D21 | One provenance per repository detail. Shared requests are not aborted by cancelling one caller. |
| D25 | One combined `resurrection-ritual` spec |
| D26 | Optional sections (manifest, branch count, CI, recent authors) can be switched off. Core sections never are. |
| D27 | Request estimate and `may-not-complete` warning, advisory only |
| Prefix decision (22 Nov 2026) | Cache keys use `graverepo:`. Ritual progress uses `graverepo-progress:`. |

### Data-layer facts this spec relies on

These were checked against `github-data-layer/design.md` and `requirements.md` and are not changed by this spec.

| Fact | Where in the data layer |
|---|---|
| `RepositoryDetail` has `core` (a repository summary), `renamedFrom`, `isEmpty` and `sections`. It has **no** provenance or fetch-time field. | Design 5.7 |
| Provenance (`source`, `route`, `fetchedAt`, `stale`) is held in the data result, one per detail. For demo data, `fetchedAt` is the capture date. | Design 5.1, 5.3, 4.8, Req 10.1–10.2 |
| `getRepositoryDetail(owner, repo, options)` and `estimateDetailRequests(repositorySummary)` are public functions. The estimate returns the estimate, the current budget (or unknown) and whether a `may-not-complete` warning applies. It makes no network request. | Design 4.1, 3.5 |
| `loadDemoGraveyard()` returns the demo graveyard including every repository's `RepositoryDetail`. | Design 4.1, 4.8, 5.8 |
| A section disabled by configuration is reported as `not-applicable` with the reason `section-disabled`. Other `not-applicable` reasons are `empty-repository` and `issues-disabled`. | Req 4.5, 4.14, 6.3, design 5.7 |
| Cache freshness: detail 30 minutes. A fresh cached copy is returned without a request. A stale copy is refreshed, with stale fallback on failure. `forceRefresh` skips the cache. | Req 7.2–7.7 |
| The activity window is "the 12 months before the request" (D15). It decides only whether recent authors are requested, and it applies to the latest commit date. The data layer does not define its exact arithmetic (calendar months or days) or whether the boundary is inclusive. | Requirements glossary, Req 4.6–4.7, design 3.2 |
| The repository summary has `isArchived`, `pushedAt` (nullable) and `hasIssues`. It has **no** `isEmpty`. `isEmpty` exists only on the detail. | Design 5.5, 5.7 |

### Data-layer limitation to flag (not changed here)

The data layer describes the open-issues section as: a count excluding pull requests, an `isLowerBound` flag, the issues page URL, and `oldest` (created date, number, URL) "or a note that no issue was found among the first 100 open items" (design 5.7, 3.2). It does **not** name the field that carries this note. Design 3.2 also says the count "is a lower bound if 100 items were returned", but the type description does not say that `isLowerBound` is set **only** in that situation, and it does not record how many items were read.

So this spec uses only what the fields prove:

| Case | How it is recognised | What it proves, and what it does not |
|---|---|---|
| No open issues | Section `available`, count 0, `isLowerBound` false | The data layer reports no open issue. |
| No issue counted, count incomplete | Section `available`, count 0, `isLowerBound` true | The data layer reports that no issue was counted and that the count is a lower bound. It does **not** prove how many items were read, so the ritual does **not** say "100" and does **not** say there are no open issues. |
| Open issues found | Section `available`, count at least 1. `oldest` holds the first non-pull-request item. | A count (a lower bound if `isLowerBound` is true) and the oldest issue. |
| Could not be checked | Section `unavailable` with a reason | Nothing about issues. |
| Issues turned off | Section `not-applicable` with the reason `issues-disabled` | Nothing about issues. |

For the second case, the proposed wording is "No open issue found. The count may be incomplete." (O15, approved; the voice document still needs a separate update, task 1.2). The voice document's line "No issue found in the first 100 open items" may be used only if the final data-layer types explicitly record that 100 items were read. Task 1.4 checks this, and task 3.2 stops and reports if the second case cannot be told apart from "No open issues". This spec does not change the data layer.

## Glossary

| Term | Meaning |
|---|---|
| **Detail** | The data layer's `RepositoryDetail`: official core summary, `renamedFrom`, `isEmpty` and one field result per section. It carries no provenance. |
| **Data result** | What the data layer returns: success with `data`, `provenance`, `warnings` and `rateLimit`, or an error. |
| **Field result** | `available` (with a value), `unavailable` (with a reason) or `not-applicable` (with a reason: `empty-repository`, `issues-disabled`, `section-disabled`). |
| **Finding** | One observation about the repository, derived from the detail. It states a fact and lists its evidence. |
| **Evidence** | A reference to a raw detail field (for example `core.pushedAt` or `sections.readme`) and the value read from it. |
| **Derived value** | A value GRAVEREPO calculates from evidence, such as "age in months". It is always labelled as derived and is never shown as a GitHub field. |
| **Omitted** | A finding that does not exist in the result because it has nothing to report, or because its optional section was switched off. Omitted is not a state of a finding. |
| **Fact / interpretation** | A fact is observable on GitHub. An interpretation is GRAVEREPO's reading of facts (conditions and plan suggestions). |
| **Condition** | A short interpretive label, such as Resting. Always shown with the fact behind it. |
| **Condition input** | The three raw fields the condition needs: `isArchived`, `isEmpty` (true, false or unknown) and `pushedAt` (or null). They come from a detail, or from a repository summary on a tombstone (O18). |
| **Display context** | The locale and time zone used to format dates for people. It is supplied from outside the domain (O21). |
| **Actionable finding** | An `available` finding that triggers exactly one plan rule. |
| **Informational finding** | A finding that does not trigger a plan item. It is explicitly marked with a reason. |
| **Plan / plan item** | The ordered list of suggested steps, and one step in it with a stable ID. |
| **Required item** | A plan item that must be ticked before the repository can be marked revived. |
| **Progress** | The visitor's ticks, current stage and revived record for one repository and source. Stored in the browser only. |
| **Progress percent** | Whole number 0–100 calculated from ticked required items, or `null` when there are none. |
| **Reference time** | The time rules compare dates against. It is the `provenance.fetchedAt` of the data result that delivered the detail (Proposed, O2). |
| **Revived record** | The small saved summary written when the visitor marks a repository as revived. |
| **The Living** | The list of repositories marked as revived on this device. |

---

## Requirement 1: Ritual flow and stage navigation

**User story:** As a visitor, I want a clear four-stage journey for one repository, so that I always know where I am and what comes next.

### Acceptance criteria

1. WHEN the visitor opens a tombstone, THE app SHALL start the ritual for that repository at the stage saved in its progress, or at the Necropsy stage if there is no valid saved progress.
2. THE app SHALL present the stages in this order in the stage indicator: Necropsy, Plan, Rising, The Living. This is the display order. It does not require the visitor to open them in this order (criterion 4).
3. THE app SHALL show a stage indicator with the four stages and the current one, giving each stage a text label and a shape, not colour alone (design system 5.2).
4. BEFORE a repository is marked revived, THE visitor SHALL be able to enter any of Necropsy, Plan and Rising from any other of the three, forward or backward, and SHALL be able to skip a stage (for example go from Necropsy straight to Rising), without losing ticks. The plan is derived from the detail, so Rising always has a plan to show. The revival gate in Requirement 7.1 is unchanged. (Approved, O19)
5. THE Living stage SHALL be entered for the first time only by marking the repository as revived (Requirement 7). WHEN a revived record exists, THE visitor MAY return to The Living by stage navigation. ANY request to enter The Living for a repository with no revived record SHALL be rejected and leave the stage unchanged.
6. THE stage rules in criteria 4 and 5 SHALL be enforced by domain and state logic. They SHALL NOT depend on hidden or disabled controls.
7. AFTER a repository is marked revived, THE visitor SHALL still be able to view the earlier stages read-only. Ticks SHALL stay locked.
8. WHEN saved progress contains the stage `living` without a revived record, THE app SHALL treat that entry as invalid (Requirement 8.5).
9. THE list of all revived repositories SHALL be reachable at any time, because it reads only revived records. Its entry point is Open (O13).
10. THE app SHALL handle one repository ritual at a time. Opening another tombstone SHALL leave the first repository's saved progress unchanged.
11. THE ritual SHALL work with the demo graveyard and with live data in the same way (Requirement 9).

## Requirement 2: Necropsy findings

**User story:** As a visitor, I want to see what can actually be observed about a repository, so that I can trust what GRAVEREPO says.

### Acceptance criteria

1. THE ritual SHALL derive findings only from a detail and a reference time given to it. It SHALL NOT fetch anything itself.
2. THE ritual SHALL derive these findings, using the wording in `voice-and-honesty.md` section 5.1: renamed, archived, empty repository, last update, latest commit, fork, README, open issues, oldest open issue, recent authors, branches, workflow runs (CI) and dependency file. "Issues turned off" is not a separate finding. It is the `not-applicable` state of the open-issues finding (data layer requirement 4.5).
3. EACH finding SHALL have a stable ID, a state of `available`, `unavailable` or `not-applicable`, and a non-empty list of evidence references.
4. EACH evidence reference SHALL name one raw field of the detail and the value read from it. Evidence SHALL NOT contain derived values. Derived values SHALL be kept in a separate list, each labelled as derived with the raw fields it was calculated from.
5. THE ritual SHALL NOT create a finding that has no evidence reference.
6. WHEN a section is `unavailable`, THE finding SHALL be `unavailable` with the data layer's reason and the "couldn't be checked" wording. IT SHALL NOT be shown as zero, none or "no activity".
7. WHEN a section is `not-applicable` with the reason `empty-repository` or `issues-disabled`, THE finding SHALL be `not-applicable` with that reason and the matching "Not applicable" wording. Findings that are `not-applicable` because the repository is empty MAY be shown grouped under the empty-repository finding, but SHALL NOT be dropped silently. WHEN a section reports a `not-applicable` reason that design 4.2 does not list for that section (the data layer is not expected to produce it), THE finding SHALL be `unavailable`, not-applicable wording SHALL NOT be used, and no claim SHALL be made from it.
8. WHEN a section is `not-applicable` with the reason `section-disabled`, THE finding SHALL be omitted. THE ritual SHALL NOT mention it, and SHALL NOT generate a plan item from it. `not-applicable` is a state a finding can have. A section-disabled section is never a finding.
9. THE following SHALL also be omitted rather than shown: the archived, fork, renamed and empty findings when the matching fact is false or absent, and the oldest-open-issue finding whenever the open-issues finding is not `available` with a count of at least 1.
10. WHEN a nullable core field is `null` (for example `pushedAt`), THE finding SHALL be `unavailable` with the matching wording.
11. WHEN a count is a lower bound, THE finding SHALL say "at least {n}".
12. WHEN the open-issues section is `available` with a count of 0 and `isLowerBound` true, THE open-issues finding SHALL say that no open issue was found and that the count may be incomplete (approved wording, O15: "No open issue found. The count may be incomplete."). IT SHALL NOT be shown as "No open issues", and SHALL NOT state how many items were checked, unless the final data-layer types explicitly record that number. WHEN the count is 0 and `isLowerBound` is false, THE wording SHALL be "No open issues". THE oldest-open-issue finding SHALL be omitted in both cases.
13. THE Necropsy SHALL show the data result's provenance once for the whole detail, using the labels in `github-data-layer/design.md` section 6, and SHALL NOT show a separate source per finding.
14. THE Necropsy SHALL show data-layer warnings that apply to the ritual (`stale-data` and `may-not-complete`) in plain wording, and SHALL NOT block the visitor.
15. THE Necropsy SHALL keep facts and interpretations visibly separate: findings are shown as facts, and the condition and any suggestion are shown as labelled interpretations next to the facts they are based on.
16. THE ritual SHALL NOT state or imply why a repository stopped being updated.
17. THE findings SHALL appear in the fixed order in design section 4.2.

## Requirement 3: Repository conditions

**User story:** As a visitor, I want a short, gentle label that summarises how recently a repository was updated, so that I can scan quickly without being misled.

### Acceptance criteria

1. THE ritual SHALL derive exactly one condition for each condition input (the `isArchived`, `isEmpty` and `pushedAt` fields of one detail, or of one repository summary on a tombstone, O18): `archived`, `empty`, `last-update-unknown`, `recently-updated`, `resting` or `dormant`.
2. THE condition SHALL be chosen by this precedence, first match wins: (1) `archived` when `isArchived` is true; (2) `empty` when `isEmpty` is true (an unknown `isEmpty` never matches); (3) `last-update-unknown` when `pushedAt` is `null`; (4) `recently-updated`; (5) `resting`; (6) `dormant`, the last three by the date comparisons in criteria 3 and 4. (O1 proposed, O17 approved)
3. THE boundaries SHALL be calculated with date comparisons in UTC. THE ritual SHALL calculate `cutoff12 = subtractMonths(referenceTime, 12)` and `cutoff24 = subtractMonths(referenceTime, 24)`, where `subtractMonths` subtracts calendar months from the reference instant in UTC, keeps the time of day, and clamps the day of the month (31 March minus 1 month gives 28 or 29 February). `pushedAt` is compared with these cutoffs as an instant. The age in whole months ("{n} months ago") is a derived display value only (the largest whole `n` for which `subtractMonths(referenceTime, n)` is not earlier than `pushedAt`, or 0). It SHALL NOT be used to choose the condition. (O3 proposed, O17 approved)
4. THE thresholds SHALL be one configuration constant (12 and 24 months) and the boundaries SHALL be: `recently-updated` when `pushedAt` is **not earlier than** `cutoff12` (a push exactly 12 months before the reference time is `recently-updated`); `resting` when `pushedAt` is earlier than `cutoff12` and **not earlier than** `cutoff24` (exactly 24 months is `resting`); `dormant` when `pushedAt` is earlier than `cutoff24`. The role rules that say "older than 12 months" SHALL use the same comparison: older means strictly earlier than `cutoff12`. (O1 proposed, O17 approved)
5. WHEN a repository is archived, THE condition SHALL be `archived` whatever its dates are. THE ritual SHALL NOT present it as active, recently updated or healthy in any label, caption, icon or description.
6. WHEN `pushedAt` is `null` and the repository is neither archived nor empty, THE condition SHALL be `last-update-unknown`.
7. THE condition SHALL always be shown with the fact behind it (for example "Resting · last updated 14 months ago"), and SHALL be labelled as an interpretation.
8. WHEN `pushedAt` is later than the reference time, THE comparison in criterion 4 gives `recently-updated` (it is not earlier than `cutoff12`), and THE displayed age SHALL be 0. THE wording SHALL show only the date ("Last updated {date}"), with no relative phrase and no negative age. IT SHALL NOT say or imply that the date is wrong, because the ritual has no evidence of why it is later.
9. THE condition names SHALL use the words approved in the voice document. THE ritual SHALL NOT use "dead", "abandoned" or other death-related claims.
10. THE condition SHALL NOT change the plan, and SHALL NOT be used to judge the repository's quality or its owner.
11. THE condition SHALL use the same 12-month length as the data layer's activity window (D15) but SHALL NOT read the data layer's window, its recent-authors result or any other data-layer value for its boundaries. THE two apply to different fields (`pushedAt` here, the latest commit date there) and the data layer does not define its boundary arithmetic, so THE ritual SHALL NOT state or imply that "recently updated" means "inside the data layer's activity window".
12. WHEN a tombstone shows a condition, THE condition SHALL be derived by the same function and rules from the repository summary's `isArchived` and `pushedAt`, with `isEmpty` unknown, and with the list's `provenance.fetchedAt` as the reference time. The `empty` condition therefore cannot appear on a tombstone until a detail is read. THE label SHALL always be shown with the "last updated" fact. THE ritual SHALL NOT infer `isEmpty` from missing or unrelated summary fields (for example `sizeKb`). `empty` appears only in the Necropsy, after the detail establishes it. (Approved, O18, default A.) The dashboard spec owns the tombstone screen and follows this rule.

## Requirement 4: Actionable and informational findings

**User story:** As a visitor, I want to know which findings lead to a suggested step and which are simply information, so that nothing is hidden or unexplained.

### Acceptance criteria

1. EACH finding that is `available` SHALL have a role: `actionable` or `informational`.
2. EACH informational finding SHALL carry an explicit reason: `fact-only` (no rule applies, or the rule could not reach a conclusion), `no-action-needed` (a rule exists and did not trigger) or `not-applicable`. EACH `unavailable` finding SHALL carry the reason `unavailable`.
3. A finding SHALL be `actionable` only when it is `available` and exactly one plan rule triggers on it. NO `unavailable` or `not-applicable` finding SHALL be actionable.
4. EVERY actionable finding SHALL map to exactly one plan item, and EVERY plan item SHALL map to exactly one actionable finding.
5. THE Necropsy SHALL show which findings lead to a suggested step, using text and an icon or shape, not colour alone.
6. THE `latest-commit` finding SHALL be actionable only when both the `latest-commit` finding and the `last-update` finding are `available` and the latest commit date is strictly earlier than `cutoff12` (Requirement 3.4). THE rule SHALL use the latest commit date, not `pushedAt`. THE latest commit date and `pushedAt` SHALL stay separate evidence: `pushedAt` is listed as evidence only because its availability is required, and its value does not affect the rule. (Approved, O24)

## Requirement 5: Plan generation

**User story:** As a visitor, I want a short, ordered checklist of suggestions I can act on, so that I know where to start.

### Acceptance criteria

1. THE ritual SHALL generate the plan from the findings by fixed rules, with no randomness, no clock reads and no network requests.
2. FOR the same detail and the same reference time, THE ritual SHALL return an identical plan every time, including item IDs, order and wording keys.
3. THE plan rules, their order and their wording SHALL be those in design section 5. (Proposed, O4)
4. EACH plan item SHALL have: a stable ID, a position, the finding it comes from, the evidence of that finding (copied from the finding, not recalculated), any derived values the rule used, a "because" fact, a suggested step, and the required flag.
5. THE ritual SHALL create a plan item only from an `available` finding with the role `actionable`. IT SHALL NOT create a plan item from `unavailable` or `not-applicable` data.
6. EVERY plan item's evidence references SHALL resolve to raw fields of the detail. Derived values SHALL be labelled as derived and SHALL NOT be shown as GitHub fields.
7. THE ritual SHALL use soft verbs in plan wording ("you could", "consider"), and SHALL NOT use "you must", "fix" or promises of results.
8. THE ritual SHALL NOT state a cause (for example "your dependencies are broken"), and SHALL state only the observed fact and a suggested step.
9. THE plan SHALL be introduced with: "Here's a suggested plan based on what we could see on GitHub." (voice 5.3)
10. ALL plan items SHALL be required for MVP. (Proposed, O5)
11. WHEN the detail produces no actionable findings, THE plan SHALL be empty, and THE Plan screen SHALL say that nothing was found to suggest. (Proposed, O6)
12. WHEN some findings are unavailable, THE Plan screen SHALL say which sections couldn't be checked, and SHALL NOT suggest steps based on them.
13. THE ritual SHALL NOT claim that completing the plan will change the repository, improve it or bring it back.
14. WHEN the repository is archived, THE Plan screen SHALL state that the steps are suggestions only, and that GRAVEREPO does not know whether they can be carried out while the repository stays archived. NO plan wording SHALL imply that an action is possible on an archived repository. (Wording Proposed, O4)
15. THE plan SHALL be limited to the data the data layer provides. IT SHALL NOT check README content, code quality, licences, tests or dependency versions.

## Requirement 6: Rising progress

**User story:** As a visitor, I want my ticks to show real progress, so that the garden growing feels earned and honest.

### Acceptance criteria

1. THE Rising screen SHALL show the plan as a checklist where the visitor can tick and untick items, using standard checkbox semantics with visible labels. (Proposed, O8)
2. THE progress percent SHALL be `floor(100 × ticked required items that exist in the plan ÷ required items in the plan)`.
3. THE progress percent SHALL be a whole number from 0 to 100, and SHALL be 100 only when the plan has at least one required item and every required item is ticked.
4. WHEN the plan has no required items, THE progress percent SHALL be `null` ("no steps"). IT SHALL NOT be 0 and SHALL NOT be 100. THE screen SHALL show "no steps" wording instead of a percentage.
5. TICKING an item SHALL NEVER decrease the progress percent. Unticking an item MAY decrease it.
6. IDs saved as ticked that are no longer in the current plan SHALL be ignored when calculating progress.
7. PROGRESS SHALL reflect only the visitor's ticks. IT SHALL NOT change because of anything GRAVEREPO observes about GitHub, and SHALL NOT be described as the repository improving.
8. THE Rising screen SHALL show progress as text ("{done} of {total} steps done", voice 5.4) as well as any graphic.
9. ONCE O12 is approved, THE garden stage SHALL be a function of the progress percent that never decreases when the percent increases. THE number of stages, the bands and the picture for `null` are decided in O12. UNTIL then, no garden stage values are defined.
10. ONCE O12 is approved, EACH garden picture SHALL have a text equivalent. Garden animation, if any, SHALL have a reduced-motion version.
11. WHEN the visitor ticks or unticks an item, THE screen SHALL announce the new progress politely to assistive technology, without moving focus.
12. THE app SHALL save every tick change immediately and SHALL show "Progress saved on this device", or the "couldn't save" message if saving fails.
13. THE app SHALL NOT allow ticking after the repository is marked revived. This SHALL be enforced by state and domain logic, not only by disabled controls.

## Requirement 7: Marking as revived and The Living

**User story:** As a visitor, I want to mark a repository as revived once I've finished its steps, so that I can see my finished work in The Living.

### Acceptance criteria

1. THE "Mark as revived" action SHALL be available only when every required item in the plan is ticked, or the plan has no required items. (Proposed, O6) This rule SHALL be enforced in domain and state logic, not only in the control.
2. WHEN the action is not available, THE screen SHALL say how many steps remain, and THE disabled control SHALL have an accessible explanation that assistive technology can read.
3. WHEN the visitor marks a repository as revived, THE app SHALL save a revived record in the browser, set the stage to The Living, and confirm with: "Marked as revived in GRAVEREPO. This is saved on this device only." WHEN the save fails, THE confirmation SHALL be replaced as described in Requirement 8.17.
4. THE revived record SHALL contain only: `owner` and `repo` (the official names), `url` (the GitHub web URL), `wasArchived`, `source` (`demo` or `live`), `evidenceFetchedAt` (the reference time of the evidence), `requiredCount` and `revivedAt`. It is part of the progress entry and is governed by the entry's single `schemaVersion`.
5. THE revived record SHALL NOT contain email addresses or any other GitHub data beyond those fields.
6. MARKING a repository as revived SHALL NEVER send a request to GitHub, and SHALL NEVER modify, comment on, star, fork or write to any GitHub resource.
7. THE app SHALL NOT use wording that implies the GitHub repository changed ("fixed", "back online", "maintained again").
8. THE Living SHALL list every repository with a valid revived record on this device (plus any revived in this session whose save failed, Requirement 8.17), each with the caption "Revived in GRAVEREPO on {date}".
9. EACH item in The Living SHALL show the source label (demo or live). IF the repository was archived when it was marked revived, THE item SHALL also show "Archived on GitHub" in text and an icon or shape. THE Living SHALL NOT show or imply that an archived repository is now active.
10. THE Living SHALL show the note "GRAVEREPO doesn't change anything on GitHub." and SHALL keep local revived status visibly separate from any GitHub status.
11. WHEN no repositories are revived, THE Living SHALL show: "No revived repositories yet. Finish a ritual and it will grow here."
12. THE Living SHALL work without a network and without a fresh GitHub detail, because it reads only revived records.
13. THE Living SHALL provide a text list that works without any visual garden.
14. AN undo or reset for a revived repository is not part of the MVP (Open, O10).

## Requirement 8: Saved progress

**User story:** As a visitor, I want my progress saved, so that I can continue where I left off.

### Acceptance criteria

1. THE app SHALL save ritual progress in the browser's `localStorage`, on this device only.
2. PROGRESS keys SHALL start with `graverepo-progress:`. THE ritual SHALL NOT read, write or remove any key that starts with `graverepo:`. (Decided 22 Nov 2026.)
3. THE key format SHALL be `graverepo-progress:v{schemaVersion}:{source}:{owner}/{repo}` with the source `demo` or `live` and owner and repo in lowercase, using the official name from the detail. THE `v{schemaVersion}` in the key SHALL equal the entry's `schemaVersion`. (Proposed, O9)
4. EACH progress entry SHALL contain: `schemaVersion`, `stage`, `tickedItemIds`, `evidenceFetchedAt` (the reference time of the data the plan was last built from), `startedAt`, `updatedAt`, and `revived` (a revived record or `null`). ONE `schemaVersion` governs the whole entry, including a nested revived record.
5. THE app SHALL validate every progress entry with a **strict** Zod schema when reading it. UNKNOWN fields, wrong types, an unsupported schema version, a stage `living` without a revived record, and malformed nested records SHALL all make the entry invalid. Unknown fields SHALL NOT be silently removed.
6. WHEN an entry is invalid, THE app SHALL treat that one repository as not started, SHALL NOT crash, and SHALL NOT read the invalid entry's values. THE app SHALL NOT delete the invalid entry or any other entry. THE next valid write for the same key replaces it. Invalid entries are skipped silently when listing The Living. (O20, retained as specified)
7. AFTER a page reload, WHEN the visitor reopens the same repository from the same source, THE ritual SHALL restore its saved stage and ticks. THE app SHALL NOT store a global pointer to the last open repository in MVP, so it SHALL NOT reopen a repository on its own after a reload. (Decided direction, see the checkpoint note below.)
8. WHEN progress cannot be written for any reason, including a full or unavailable storage, THE app SHALL continue with progress held in memory for the session, SHALL tell the visitor with the wording in voice 5.4, and SHALL NOT delete any stored entry, progress or cache, to make room (criterion 17, O22).
9. WHEN the data layer clears its cache after a storage failure, saved progress and revived records SHALL stay untouched. THE ritual's store SHALL manage only `graverepo-progress:` entries. THE data layer SHALL remain responsible for its own cache cleanup.
10. THE app SHALL NOT use cookies, analytics, other storage or any server for progress.
11. WHEN a repository is reopened with newer data, THE app SHALL keep ticked IDs and SHALL recompute progress against the new plan. THE app SHALL show a short note that the plan changed because newer GitHub data was available only when the reference time of the newly loaded data differs from the saved `evidenceFetchedAt` **and** at least one saved ticked ID is not among the new plan's item IDs. THE app SHALL NOT show the note merely because the data was refreshed, and SHALL NOT show it when the new plan only gains items. THE app SHALL NOT store the previous plan, and this behaviour SHALL NOT change the progress entry's schema. Progress is recomputed either way. (Approved, O23. Limitation: a plan that only gains items is not announced.)
12. WHEN a visitor opens the same repository from the demo and from live data, THE two progress entries SHALL be independent. (Proposed, O9)
13. WHEN a live repository is reopened, THE state layer SHALL call `getRepositoryDetail` with the default options and SHALL leave caching to the data layer: a fresh cached copy is returned without a request, a stale copy is refreshed, and a failed refresh may return the stale copy with its error. THE ritual SHALL NOT add its own detail cache, SHALL NOT use `forceRefresh`, and SHALL NOT bypass the data layer's cache rules.
14. WHEN a live detail cannot be loaded and the data layer has no copy, THE ritual SHALL NOT open, even if saved progress exists. THE saved progress SHALL stay untouched, and the demo SHALL be offered only when `demoAvailable` is true.
15. THE entry's `evidenceFetchedAt` SHALL be set by the state layer, and only when the entry is written. WHEN the entry is first created (the first stage move, tick or revive), it SHALL be set to the reference time of the session. ON every later write before revival (stage move, tick or untick), it SHALL be set to the reference time of the session, which is the data the visitor's current plan was built from. Opening or viewing SHALL NOT write it. AFTER revival, no write SHALL change it. THE revived record's `evidenceFetchedAt` SHALL be the same value as the entry's, written in the same write as the revival.
16. THE state layer SHALL read only keys whose version equals the current `schemaVersion` (`graverepo-progress:v1:` for this version). A key with another version, or an entry whose `schemaVersion` differs from its key's version, SHALL be treated as invalid under criterion 6 (not read, not deleted). THE MVP has no migration.
17. WHEN a write fails (including a full or unavailable `localStorage`), THE app SHALL keep the change in memory for the session, SHALL show the "couldn't save" wording, and SHALL retry the write on the visitor's next change. WHEN the failed write is the revival, THE revival SHALL still succeed for the session, THE confirmation SHALL be the "couldn't save" wording instead of "saved on this device", and THE Living SHALL include the repositories revived in this session from memory. THE app SHALL NOT remove any entry to make room. (Approved, O22)

**Checkpoint note (needs your confirmation, O16):** roadmap check 3 says "Ritual progress survives a page reload — reload in the middle of a ritual". With criterion 7, the check passes when the visitor reloads, reopens the same tombstone (demo or live search) and finds the same stage and ticks. If you want the app to return to the open repository automatically after a reload, that needs a small global pointer and a change here.

## Requirement 9: Demo and live parity, and no GitHub requests in demo

**User story:** As a judge, I want the demo to be a true Resurrection Ritual that works offline, so that I can try the whole experience.

### Acceptance criteria

1. THE domain rules SHALL be identical for demo and live data. THE findings, conditions and plan SHALL depend only on the detail and the reference time. THEY SHALL NOT depend on provenance source, route or stale flag.
2. THE reference time SHALL be the `provenance.fetchedAt` of the data result that delivered the detail, because `RepositoryDetail` has no fetch time of its own. FOR demo data it is the provenance of the `loadDemoGraveyard` result (the capture date). (Proposed, O2)
3. THE demo ritual SHALL take each repository's detail from `loadDemoGraveyard`, and SHALL NOT call `getRepositoryDetail` for demo repositories.
4. WHILE the demo is in use, including loading it, opening a tombstone, completing the four stages and viewing The Living, THE app SHALL send no request to GitHub.
5. AN automated test SHALL fail if any GitHub request is attempted during a complete demo ritual. This extends data-layer requirement 8.19.
6. THE complete demo ritual SHALL be: open the demo, open a tombstone, complete Necropsy, Plan and Rising, mark the repository revived, and see it in The Living (checkpoint check 2).
7. THE demo SHALL include at least one repository that produces a non-empty plan, so the full ritual can be completed. IF none does, THE project SHALL stop and report before changing the captured snapshot. THE project SHALL NOT fabricate demo GitHub data to force a plan.
8. THE app SHALL label demo data as demo and SHALL NOT show it as the result of a searched username.

## Requirement 10: Data-layer use, layers, errors and cancellation

**User story:** As the developer of GRAVEREPO, I want the ritual to respect the layer boundaries, so that the code stays simple and testable.

### Acceptance criteria

1. THE domain layer (`src/ritual/`) SHALL be pure. IT SHALL NOT import React, Zod, data-layer transports, adapters or schemas, and SHALL NOT use `fetch`, `localStorage` or `Date.now`. It imports data-layer types only. Runtime validation of stored progress belongs to the state layer.
2. THE application-state layer SHALL call the data layer's public interface (`getRepositoryDetail`, `estimateDetailRequests`, `loadDemoGraveyard`), SHALL use the domain functions, and SHALL own progress storage and its Zod schemas.
3. UI components SHALL trigger state actions. THEY SHALL NOT call GitHub, import transports, adapters or schemas, or manage requests.
4. THE state action that starts a detail request SHALL create the `AbortController`, pass its signal to the data layer, and abort it when the result is no longer needed or a newer request replaces it. A `cancelled` result SHALL be ignored. A late result from a replaced or cancelled request SHALL NOT change the current ritual session or any saved progress.
5. THE state layer SHALL handle both branches of every data result. A data-layer error SHALL be shown with the wording in voice 5.8, and the demo SHALL be offered only when `demoAvailable` is true.
6. A failed or cancelled detail request SHALL NOT create a progress entry. A progress entry SHALL be created only when the visitor changes something (moves stage, ticks or revives).
7. WHEN the repository's official name differs from the name requested (`renamedFrom` is set), THE Necropsy SHALL show "Now named {official name} (you opened {requested name})". THE ritual SHALL NOT add any rename handling of its own. Progress keys use the official name.
8. THE ritual SHALL treat provenance as read-only data, and SHALL NOT label cached or demo data as live.
9. BEFORE a live detail request starts, THE state layer SHALL call `estimateDetailRequests` with the repository's summary when it is known, and SHALL keep the returned estimate, budget and warning flag in the session state. WHILE the request is pending, THE screen SHALL show the `may-not-complete` warning when the estimate result says it applies. WHEN the data result arrives, THE screen SHALL show the warning from the result's `warnings` instead, and SHALL NOT show it twice. THE warning SHALL be advisory and SHALL NOT block the visitor. THE ritual SHALL NOT calculate or track a request budget of its own.
10. THE ritual SHALL NOT add data-layer requests, sections or functions.

## Requirement 11: Wording, honesty and dates

**User story:** As a visitor, I want GRAVEREPO to describe repositories fairly and truthfully, so that it never feels judgemental or misleading.

### Acceptance criteria

1. ALL ritual text SHALL follow `voice-and-honesty.md`. THE ritual SHALL keep its text in one wording module, selected by keys and filled from data.
2. THE ritual SHALL NOT use the avoided words in voice section 3 (including dead, deceased, killed, abandoned, forsaken, rotting, neglected) in any text about a repository or its owner. THE ritual SHALL NOT describe a repository as permanently dead or gone.
3. THE ritual SHALL NOT state why a developer stopped work, or what they intended.
4. THE ritual SHALL NOT invent repository data, activity, contributors or technical problems. Unknown SHALL stay unknown.
5. THE ritual SHALL NOT imply that GRAVEREPO edits, fixes or repairs a GitHub repository.
6. "Revived" SHALL always be shown as local to GRAVEREPO.
7. THE ritual SHALL use the theme words (Graveyard, Tombstone, Necropsy, Rising, The Living) as product names only, with plain wording for facts.
8. WHERE this spec proposes wording not yet in the voice document, THE wording SHALL be reviewed and added to the voice document by the project owner before it ships. THE implementation SHALL use only approved wording.
9. ALL date and time comparisons SHALL use UTC (Requirement 3.3). ALL displayed dates, in Necropsy, Plan, Rising and The Living, SHALL use the same format, the visitor's locale and the visitor's local time zone, formatted with `Intl`. (O14 proposed, O21 approved)
10. THE wording module SHALL take a display context, `{ locale, timeZone }`, as an explicit parameter on every function that formats a date, so tests can fix both. THE state layer (or the app shell) SHALL supply it, read once at startup from `Intl.DateTimeFormat().resolvedOptions()`. IF the browser gives no value, THE locale SHALL be `en` and THE time zone SHALL be `UTC`, and a date formatted in the fallback zone SHALL be labelled "UTC". THE domain and the wording module SHALL NOT read the browser's locale, time zone or clock themselves. All text other than the date format stays in English. (Approved, O21)
11. RELATIVE phrases ("{n} months ago") SHALL be measured against the reference time and SHALL be shown together with the absolute date and the provenance label.

## Requirement 12: Accessibility and motion

**User story:** As a visitor using a keyboard, a screen reader or reduced motion, I want the whole ritual to work for me.

### Acceptance criteria

1. THE complete ritual SHALL be usable with the keyboard only, including the stage indicator, ticking, marking revived and viewing The Living (checkpoint check 6).
2. EVERY interactive element SHALL have a visible focus indicator, and focus SHALL move predictably to the stage heading when the stage changes.
3. THE ritual SHALL NOT depend on colour alone for status, role, condition or progress.
4. LOADING, empty, error, partial and success states SHALL be defined for every stage (design system 4.3), with the wording in the voice document.
5. EVERY animation SHALL respect `prefers-reduced-motion: reduce` and carry the same information without movement.
6. THE ritual SHALL meet the contrast, text-size and zoom rules in `design-system.md`. Final colours remain Open.
7. THE domain output SHALL be presentation-agnostic (structured findings, conditions and plan items), so that Lantern Mode can present it differently without changing the rules.

## Requirement 13: Tests

**User story:** As the developer of GRAVEREPO, I want the rules tested so that honesty and progress guarantees cannot silently break.

### Acceptance criteria

1. EVERY test listed in this spec's design section 9 SHALL be implemented. Tests beyond that list need a short justification (tech.md section 10).
2. THE tests SHALL use Vitest and fast-check, and SHALL run offline with no GitHub access.
3. THE unit tests SHALL cover each finding including the omitted, `not-applicable` and open-issue cases, the condition precedence and the exact boundaries (exactly 12 and 24 months, one second either side, future dates, unknown `isEmpty`), each plan rule, the progress calculation including the no-step case, the stage transitions including stage skipping and behaviour after revival, the revive gate, strict storage validation, key and schema version consistency, demo and live progress independence, the renamed finding and official-name keys, and the storage-full fallback.
4. THE property tests SHALL prove at least: determinism, unknown data staying unknown, evidence traceability, the actionable-to-plan one-to-one mapping, progress bounds and monotonicity, archived never active, condition boundary consistency, the revive gate, stage-transition safety, storage round trip and key prefix, wording never containing avoided words, and parity of results for different provenance.
5. THE integration tests SHALL cover: the complete demo ritual with a failing GitHub `fetch`, reopening the same repository after a reload (before and after revival), an invalid progress entry, a cache cleanup that leaves progress intact, live error paths with the estimate warning, cancellation, live reopening through the data layer's cache rules, marking as revived making no requests, and a live renamed repository.
6. TESTS of normal findings and plans SHALL use the captured demo snapshot once it exists. Before that, they MAY use clearly named test builders for `RepositoryDetail` values. Builders are never presented as GitHub data.
7. A test SHALL fail if any file under `src/ritual/` imports React, Zod, or a data-layer transport, adapter or schema, or contains `fetch`, `localStorage` or `Date.now`.

---

## Decision list

### Reused (already approved)

D5, D6, D14, D15, D21, D25, D26, D27, and the progress and cache prefix decision of 22 November 2026.

### Approved in this revision (recorded)

| ID | Decision (approved) | Recorded in |
|---|---|---|
| O15 | Open issues with count 0 and `isLowerBound` true read "No open issue found. The count may be incomplete." No number of items is claimed. The voice line "No issue found in the first 100 open items" is used only if the final data-layer types explicitly record that 100 items were read. The voice document still needs a separate update (task 1.2) before this text ships. | Req 2.12, data-layer limitation section, design 4.2, 10.1, U2, tasks 1.4, 3.2 |
| O17 | Conditions use date comparisons in UTC, not whole-month ages. `cutoff12` is the reference time minus 12 months and `cutoff24` minus 24 months. Recently updated: `pushedAt` not earlier than `cutoff12` (exactly 12 months is recently updated). Resting: earlier than `cutoff12` and not earlier than `cutoff24` (exactly 24 months is resting). Dormant: earlier than `cutoff24`. The 12 and 24 month thresholds are unchanged. The displayed "{n} months ago" is display-only. | Req 3.2–3.4, 3.8, design 4.3, U1, U4, P16, tasks 2.2, 2.3, 4.1–4.3 |
| O18 | Default A. The tombstone uses the same `deriveCondition` on the repository summary's `isArchived` and `pushedAt`, with `isEmpty` unknown (`null`). "Empty" appears only in the Necropsy, after the detail establishes it. Emptiness is never inferred from missing or unrelated summary fields (for example `sizeKb`). The dashboard spec wires the tombstone and must follow this. | Req 3.1, 3.2, 3.12, design 4.1, 4.3, U4, task 4.1 |
| O19 | Before revival the visitor may move freely among Necropsy, Plan and Rising and may skip stages. The Living is reachable only after revival. The revival gate is unchanged: every required item ticked, or the plan has no required items. | Req 1.2, 1.4, 1.5, 7.1, design 3.3, U14, P15, tasks 6.2, 10.1 |
| O20 | Retained as already specified: an invalid or other-version entry is not read and not deleted. The next valid write for the same key replaces it. | Req 8.6, 8.16, design 7.2, U11, I3 |
| O21 | A display context `{ locale, timeZone }` is passed into the wording module. The state layer reads it once through `Intl`. The fallback is `en` and `UTC`, with UTC clearly labelled when used. Dates use medium formatting. Date comparisons stay in UTC, and display formatting never affects condition calculations. | Req 11.9, 11.10, design 3.1, 4.1, 8.2, 10, U10, tasks 8.1, 10.1, 12.1 |
| O22 | A failed write, including a full storage, keeps the change in memory, shows a clear "couldn't save" warning, retries on the next change and deletes no existing entry. A revival that cannot be saved stays valid for the session and appears in The Living from memory. The message says the progress is lost when the page closes. | Req 7.3, 7.8, 8.8, 8.17, design 6.4, 7.2, 8.1, U17, tasks 9.2, 14.2, 14.3 |
| O23 | Plan-changed note, Option A. The note is shown only when newly loaded data has a different reference time from the saved `evidenceFetchedAt` and at least one previously ticked ID is not among the new plan's item IDs. It is not shown merely because data was refreshed, and not when the plan only gains items. The previous plan is not stored and the progress schema does not change. Limitation: a plan that only gains items is not announced. | Req 8.11, design 3.2, 7.3, I7, tasks 10.3, 15.3 |
| O24 | Latest-commit role rule, Option A. `latest-commit` is actionable only when both `latest-commit` and `last-update` are `available` and the latest commit date is strictly earlier than `cutoff12`. The rule uses the latest commit date, not `pushedAt`. The two dates stay separate evidence signals. | Req 4.6, design 4.2, 4.4, 5.1, U5, U6, task 4.2 |

The voice-document wording for O15, O21, O22 and the plan-changed note (O23) still needs the separate steering update in task 1.2.

### Proposed or Open (need your approval)

| ID | Decision | Proposed default | Why it matters |
|---|---|---|---|
| O1 | Condition names and thresholds | Recently updated, resting and dormant, with thresholds of 12 and 24 months. Precedence: archived, empty, unknown, then date comparison. **Exact boundaries are in O17.** | The voice document leaves these to this spec. They appear on every tombstone. |
| O2 | Reference time for rules | `provenance.fetchedAt` of the data result that delivered the detail (the capture date for demo). | Keeps plans identical for the same data. Relative phrases are therefore measured at fetch time, not today, so a demo repository can read "14 months ago" relative to its capture date. The provenance label shows that date. |
| O3 | What "last updated" means | The core `pushedAt` date. The latest commit is a separate finding. | The data layer stores no `updated_at`. Mixing the two would mislead. |
| O4 | Plan rules, order and wording | Seven rules in design section 5, including the archived suggestions-only note and the future-date wording. | The voice document leaves plan wording to this spec. Wording must be approved and added to the voice document before use. |
| O5 | Optional plan items | None. All items are required. | Controls when "Mark as revived" unlocks. |
| O6 | Plan with no items | "Mark as revived" is allowed. Progress is `null`. | Healthy repositories would otherwise be impossible to finish. |
| O7 | Archived repositories | `review-archived` comes first. Other items stay, with the suggestions-only note. An archived repository can be marked revived, and The Living shows "Archived on GitHub". | Avoids presenting an archived repository as active and keeps the ritual finishable. |
| O8 | Stage split | Plan is a read-only review. Ticking happens in Rising. | Affects the screens and the checkpoint check. |
| O9 | Progress key and independence | `graverepo-progress:v1:{demo\|live}:{owner}/{repo}`. Demo and live progress are separate. | Avoids mixing a plan from one data source with ticks from another. |
| O10 | Undo or reset after reviving | Not in MVP. | Visitors cannot undo a mistaken revive. Needs wording if added. |
| O11 | Where ritual wording lives | `src/ritual/wording.ts`, pure functions. Shared error text is owned by the dashboard spec. | `tech.md` asks for one text module. |
| O12 | Garden stages | **Unresolved. No stage count, bands or placeholder is defined.** | Depends on the open design-system decisions (mascots, art). Rising ships with checklist and progress text first. |
| O13 | Entry point to The Living | Decided in the `graveyard-dashboard` spec. | Navigation belongs to the dashboard. |
| O14 | Date display time zone | Local time zone of the visitor, one format everywhere, comparisons in UTC. **Locale is in O21.** | Matches voice 5.8 (local time). Tests fix the time zone. |
| O16 | Reload behaviour and checkpoint check 3 | Reopening the same repository restores stage and ticks. No global "last open repository" pointer. | Changes how check 3 is performed (reload, reopen, compare). |

### Known limitations (accepted unless you object)

- Two browser tabs can overwrite each other's progress. The last write wins. There is no cross-tab sync.
- If a repository is renamed between visits, progress saved under the old name is not found. Progress uses the official name only.
- GRAVEREPO does not know whether the visitor owns the repository. Plan wording is neutral and does not assume write access.
- An invalid progress entry is left in storage until the same key is next written. It never affects other entries.
- When a live detail cannot be loaded and there is no data-layer copy, saved progress for it cannot be used until the data returns.
- The plan-changed note is shown only when a saved ticked ID is missing from the new plan (Requirement 8.11, approved O23). A newer plan that only adds items is not announced, because the old plan is not stored. Progress is recomputed either way.
- The data layer does not define the boundary arithmetic of its 12-month activity window. The ritual's condition does not depend on it (Requirement 3.11).
- When storage is full, progress and revived records of this session can be lost when the page closes (O22). The message says so.
