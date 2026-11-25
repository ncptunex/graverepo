# Implementation tasks: resurrection-ritual

**Status:** Draft for review (third revision, approvals recorded). Approved: O15, O17, O18, O19, O21, O22, O23 and O24 (and O20 retained as specified). Do not start implementation before the approval gates in Group A are passed.

Each task is small enough to finish and review on its own. Tasks list the requirements they satisfy (for example, _Req 5.2_) and the tests in `design.md` section 9 (for example, _U4, P8_). Work through them in order inside each group.

**Schedule, priorities and checkpoint:** see [`docs/roadmap.md`](../../../docs/roadmap.md). Dates in brackets are the planned days and follow the roadmap. The ritual is priority 1. Never move the ritual screens (26 Nov) later to make room for anything else.

**Layer rules:** `src/ritual/` is pure (no React, Zod, `fetch`, `localStorage` or `Date.now`). `src/state/` owns requests, cancellation, storage and Zod schemas. UI triggers state actions. See `.kiro/steering/tech.md`. Folder names `src/ritual/` and `src/state/` are proposals until approved (task 1.3). The state action that changes stage is named `applyStageChange` everywhere. `src/ritual/stages.ts` holds only the pure predicates `canEnterStage` and `canToggle`.

**Depends on the data layer:**
- Types (data-layer task 4.1, 23 Nov) and the adapters that fix the representation of the repository summary, latest commit and issues (data-layer tasks 5.2, 5.4 and 5.5, 23 Nov) before task 2. Verified in task 1.4, which runs after data-layer task 5.5.
- Demo snapshot and `loadDemoGraveyard` (data-layer task 6, 24 Nov) before tasks 15 and 10.1's demo path.
- `getRepositoryDetail` and `estimateDetailRequests` (data-layer task 9, 26 Nov) before task 16. The ritual works on demo data without them.

**Approval gates:** a task that uses Proposed or Open decisions starts only after those decisions are approved. The decision-dependency table below lists which O-items each task needs. O12 (garden stages) is unresolved and no task decides it.

**If behind schedule:** use the cut order in `design.md` section 11. The demo ritual comes before live wiring, and live wiring before visuals.

### Decision-dependency table

A task listed here starts only after the listed O-items are approved (task 1.1). "Wording" means the voice-document update in task 1.2 is also needed. See `requirements.md`, "Decision list", for each O-item.

| Task | Needs approval of | Why |
|---|---|---|
| 1.2 | O4, O15, O21, O22, O23 (O15, O21, O22 and O23 are approved; the voice document update itself is still pending) | Wording to add to the voice document |
| 1.4 | O15 | Decides what the open-issues check must prove |
| 2.2 | O17, O21 | Boundary arithmetic, display-only age |
| 2.3 | O1, O4, O17 | Thresholds, rule order, boundaries |
| 3.1 | O3 | Meaning of "last updated" |
| 3.2 | O15 | Open-issues wording and the stop rule |
| 4.1 | O1, O3, O17, O18 | Thresholds, boundaries, condition input and signature |
| 4.2 | O17, O24 (approved) | Role comparisons use the same boundary. The `latest-commit` rule uses the latest commit date. |
| 5.1, 5.2 | O4, O5, O6, O7 | Plan rules, required items, empty plan, archived |
| 5.3 | O2 | Reference time |
| 6.1 | O5, O6 | Required items, empty plan |
| 6.2 | O8, O19 | Stage split, forward skipping |
| 6.3 | O12 | Not scheduled until approved |
| 8.1, 8.2 | O1, O4, O11, O14, O15, O21, O22 and task 1.2 | Wording and display context |
| 9.1, 9.2 | O9, O20, O22 | Keys, invalid entries, storage full |
| 9.3 | O9, O20, O22 | Tests for the above |
| 10.1 | O2, O9, O16, O19, O22 | Reference time, keys, reload, skipping, storage full |
| 10.3 | O23 (approved) | Plan-changed detection, Option A |
| 10.4 | O19, O22 | Stage safety model, storage full |
| 12.1 | O14, O15, O17, O18, O21 | Display and condition wording |
| 13.1 | O4, O6, O7 | Plan screen content |
| 14.1 | O8, O12 | Rising without garden |
| 14.2 | O6, O10, O22 | Revive rules, no undo, storage full |
| 14.3 | O7, O13, O22 | Archived label, entry point, in-memory records |
| 15.1 | O16 | Reload behaviour |
| 15.3 | O9, O16, O20, O23 (approved) | Invalid entries, plan-changed, reload after revival |
| 16.1 | O2 | Reference time for live data |
| 16.3 | O2, O16 | Live paths |
| 18.1 | O16 | Checkpoint check 3 |
| 19.1 | O12 | Garden |

Task 1.1 records the answers. O13 (entry point to The Living) belongs to the dashboard spec.

**If behind schedule:** use the cut order in `design.md` section 11. The demo ritual comes before live wiring, and live wiring before visuals.

---

## Group A: Approvals and verification

- [ ] 1. Approvals and verification [by Mon 23 Nov]
  - [ ] 1.1 **Input needed:** review `requirements.md`, `design.md` and this file, and approve or change the Proposed items. O15, O17, O18, O19, O21 and O22 are approved and O20 is retained as specified (see "Approved in this revision" in `requirements.md`). O23 and O24 are also approved. Still to decide: the other Proposed items. Record the answers in the decision list. O12 may stay unresolved without blocking the schedule (see tasks 2.3, 6.3, 14.1 and 19).
  - [x] 1.2 **Approved and added to `voice-and-honesty.md` (journal 23 Nov):** the proposed wording listed in `design.md` section 10.1 must be reviewed and added to `voice-and-honesty.md` in a separate task that you approve. It covers: plan items, finding order, the **empty-plan line**, the **plan-changed note**, the **revive-disabled explanation**, the **pending request-estimate note** (reuse of the approved `may-not-complete` line while the request is pending), the archived suggestions-only note, the future-date form, the open-issues line for count 0 with a lower bound (O15, replacing the voice document's "No issue found in the first 100 open items" unless the data layer's types support it), and the "UTC" label for the fallback time zone (O21). **This spec's tasks do not edit that document.** The wording module (task 8) and the screens use only wording that has been approved there. If it is not approved by Wed 25 Nov, tasks 8, 12, 13 and 14 are blocked, and the Thursday screens are at risk.
    _Req 11.8, 2.12, 5.11, 7.2, 8.11, 10.9_
  - [ ] 1.3 **Approval gate, no edit:** confirm the folder names `src/ritual/` and `src/state/`, the layer split, and the technical conventions this spec relies on (Zod only in the state layer, pure domain). **This spec's tasks do not edit `tech.md`.** Until you approve, the names are proposals. Any change to `tech.md` is a separate approved task.
    _tech.md sections 2 and 3_
  - [x] 1.4 **Verification gate (after data-layer tasks 4.1 and 5.5, both 23 Nov):** read the actual data-layer types and adapter outputs for the repository summary (5.2), latest commit (5.4) and issues (5.5), together with the provenance and field-result types (4.1). Confirm each fact in "Data-layer facts this spec relies on" in `requirements.md`: the `RepositoryDetail` shape, `DataResult.provenance.fetchedAt` as the reference time, the repository summary fields `isArchived` and `pushedAt` (and that it has no `isEmpty`), the open-issues representation, and section field results and reasons. For open issues, confirm which of these the types can tell apart: count 0 with `isLowerBound` false, count 0 with `isLowerBound` true, count at least 1 with `oldest`, `unavailable`, and `not-applicable: issues-disabled`. Also record whether any field explicitly states that 100 items were read. If any fact differs, **stop and report** before tasks 2–5. Do not change the data-layer spec.
    _Req 9.2, 2.12_
    **Result (checked against `src/data/github/types.ts`):** every listed fact holds. `RepositoryDetail` is `core`, `renamedFrom`, `isEmpty`, `sections`, with no provenance. `provenance.fetchedAt` is on the data result. The summary has `isArchived` and `pushedAt` (nullable) and no `isEmpty`. All five open-issues cases can be told apart. The type also has `itemsRead` (at most 100) and `oldestNotFoundInFirst100`, so a field does record that 100 items were read. The approved O15 wording is still used. Switching to the voice line "No issue found in the first 100 open items" needs your explicit approval.
## Group B: Domain logic (pure) [Tue 24 Nov]

- [x] 2. Types, dates and test builders
  - [x] 2.1 Define the types: finding (with raw evidence and separate derived values), condition, plan item, necropsy result, ritual progress, revived record (design 4.1, 7.1). Types only. No Zod in the domain.
    _Req 2.3–2.5, 4, 5.4, 7.4, 8.4, 10.1_
  - [x] 2.2 Write `dates.ts`: `subtractMonths` (UTC, keeps time of day, day clamped), `ageInMonths` (display only, future dates give 0), and `isOlderThanMonths(date, n, referenceTime)`, true exactly when the date is strictly earlier than `subtractMonths(referenceTime, n)`. Work on ISO strings. Use no clock.
    _Req 3.3, 3.4, 3.8, 11.9_ _U1, P14_
  - [x] 2.3 Write `config.ts` with the condition thresholds (12 and 24 months, O1, O17) and the plan rule order (O4), **after those are approved**. Do not add garden stages, bands or placeholder values. O12 stays unresolved.
    _Req 3.4_
  - [x] 2.4 Write the test builders and fast-check arbitraries for `RepositoryDetail` in `tests/ritual/builders.ts`. Name and comment them as test builders, never as GitHub data.
    _Req 13.6_

- [x] 3. Necropsy findings
  - [x] 3.1 Write the core-field findings: `renamed`, `archived`, `empty`, `last-update`, `fork`. Omit `renamed`, `archived`, `empty` and `fork` when the fact is false or absent. Use `unavailable` when `pushedAt` is null. The `renamed` finding carries evidence `renamedFrom`, `core.owner` and `core.name`.
    _Req 2.2, 2.9, 2.10, 10.7_
  - [x] 3.2 **Conditional on task 1.4.** Write the core-section findings: `latest-commit`, `readme`, `open-issues`, `oldest-open-issue`. First verify how the data layer's types represent these outcomes: no open issues (count 0, no lower bound), count 0 with a lower bound, count at least 1 with `oldest`, unavailable because of an error, and issues turned off. If the types cannot tell "count 0 with `isLowerBound` false" from "count 0 with `isLowerBound` true", **stop and report the limitation** before writing any logic. Do not invent data-layer fields. If they can, implement the five cases in design 4.2: count 0 with a lower bound uses the proposed wording "No open issue found. The count may be incomplete." and states no number of items checked (the voice document's "first 100 open items" line only if task 1.4 found an explicit field that records it and you approved it, O15). Include `not-applicable: issues-disabled` on `open-issues` (no separate finding), lower bounds, and omit `oldest-open-issue` when `oldest` is missing. Treat an unlisted `not-applicable` reason as `unavailable` (design 4.2).
    _Req 2.6, 2.7, 2.9, 2.11, 2.12_ _U2_
  - [x] 3.3 Write the optional-section findings: `recent-authors`, `branches`, `ci`, `dependency-file`. A section reported as `not-applicable: section-disabled` (switched off by configuration, D26) is **omitted**: no finding, no wording, no plan item. A section reported `not-applicable: empty-repository` is a **finding** in the `not-applicable` state. `issues-disabled` belongs to `open-issues` (task 3.2).
    _Req 2.7, 2.8_
  - [x] 3.4 Attach raw evidence to every finding, list derived values separately, and fix the output order (design 4.2).
    _Req 2.3–2.5, 2.17_
  - [x] 3.5 Write the unit tests.
    _U2, U3, U15_

- [x] 4. Condition and roles
  - [x] 4.1 Write `deriveCondition(conditionInput, referenceTime)` where the condition input is `isArchived`, `isEmpty` (true, false or null) and `pushedAt`. Use the precedence and the date comparisons against `cutoff12` and `cutoff24` (design 4.1 and 4.3). Make `analyseRepository` build the input from the detail. An unknown `isEmpty` never gives `empty`. The same function is what the dashboard calls for a tombstone if O18 is approved. Do not add a second function.
    _Req 3.1–3.4, 3.8, 3.11, 3.12_
  - [x] 4.2 Write the role rules and informational reasons (design 4.4), using `isOlderThanMonths` for every "older than 12 months" check. No `unavailable` or `not-applicable` finding can be actionable. The `latest-commit` role rule (O24, approved): actionable only when both `latest-commit` and `last-update` are `available` and `isOlderThanMonths(latestCommit.date, 12, referenceTime)` is true. Use the latest commit date, never `pushedAt`. List `pushedAt` as evidence for availability only. The `review-latest-commit` plan item triggers on exactly this.
    _Req 3.4, 4, 4.6_
  - [x] 4.3 Write the unit tests, including archived with a recent push, a future `pushedAt`, every row of the boundary table in design 4.3 (exactly at, and one second either side of, `cutoff12` and `cutoff24`), `isEmpty: null`, and the `latest-commit` role cases listed under U5 (latest commit date versus `pushedAt`).
    _U4, U5_

- [x] 5. Plan
  - [x] 5.1 Write the rule table (design 5.1) and `buildPlan`, with fixed order, stable IDs and a required flag. Use only wording approved under task 1.2.
    _Req 5.1–5.5, 5.10_
  - [x] 5.2 Create plan items only from `available`, `actionable` findings. Copy the finding's evidence into the item and keep derived values separate. Handle the empty plan and the archived suggestions-only note.
    _Req 5.5, 5.6, 5.11, 5.12, 5.14_
  - [x] 5.3 Write `analyseRepository(detail, referenceTime)` as the single entry point. **First verify the actual data-layer type and the provenance field** that holds the fetch time (task 1.4). Do not assume `detail.provenance`. The reference time is passed in by the state layer from the data result's provenance.
    _Req 9.1, 9.2_
  - [x] 5.4 Write the unit tests.
    _U6_

- [ ] 6. Stage, progress and revive logic
  - [x] 6.1 Write `reconcileTicks`, `progressPercent` (`null` when there are no required items), `remainingSteps`, `canMarkRevived` and `buildRevivedRecord`.
    _Req 6.2–6.6, 7.1, 7.4, 7.5_
  - [x] 6.2 Write `stages.ts` with the pure predicates `canEnterStage` (The Living only with a revived record, free movement among the first three stages including forward skips, O19) and `canToggle` (not after revival), following design 3.3. The state action `applyStageChange` is written in task 10.1. No stage-change helper exists in the domain.
    _Req 1.4–1.7, 6.13, 7.1_
  - [ ] 6.3 **Gated on O12, not scheduled until approved:** `gardenStage`. Write nothing now, and add no bands, stage counts or placeholder. When O12 is approved, add the function and its tests (U9, P7) as one new task.
    _Req 6.9, 6.10_
  - [x] 6.4 Write the unit tests, including the after-revival cases.
    _U7, U8, U12, U14, U18_

- [x] 7. Property tests for the domain [Tue 24 Nov, may continue to Wed 25 Nov]
  - [x] 7.1 Determinism, unknown stays unknown, traceability, actionable mapping, plan structure, and condition boundaries.
    _P1, P2, P3, P4, P12, P16_
  - [x] 7.2 Progress bounds, monotonic progress, revive gate, and archived never active.
    _P5, P6, P9, P8_
  - [x] 7.3 Add the purity test: no React, Zod, transports, adapters, schemas, `fetch`, `localStorage` or `Date.now` in `src/ritual/`.
    _Req 10.1, 13.7_ _U13_

- [x] 8. Wording module [Tue 24 – Wed 25 Nov, after task 1.2]
  - [x] 8.1 Write `wording.ts` from the **approved** voice wording only: findings, condition labels with facts, plan items, Rising and The Living text, stage names, the future-date form, the archived note, the empty-plan line, the plan-changed note, the revive-disabled explanation and the open-issues line (design 10.1). Take the display context `{ locale, timeZone }` as an explicit parameter and format dates with `Intl` against the reference time. Label a date in the fallback zone "UTC". Read no clock, locale or time zone.
    _Req 11.1, 11.8–11.11_ _O21_
  - [x] 8.2 Write the wording tests, including the avoided-words property test.
    _U10, P10_

## Group C: Saved progress and state [Wed 25 Nov, finish by Thu 26 Nov morning]

- [x] 9. Progress store (state layer)
  - [x] 9.1 Write the **strict** Zod schemas for the progress entry and the nested revived record. Unknown fields, wrong types, an unsupported version, a `schemaVersion` that differs from the version in the key, the stage `living` without a revived record, and malformed nested records must all be rejected, never stripped. One `schemaVersion` covers the whole entry, and the revived record has none of its own. Use `evidenceFetchedAt` in both. Check at compile time that the schema output matches the domain types.
    _Req 8.4, 8.5, 8.16, 7.4_
  - [x] 9.2 Write `progress-store.ts`: key builder (`graverepo-progress:v1:{source}:{owner}/{repo}`), read, write and list revived. Read and list only `graverepo-progress:v1:` keys, and manage only `graverepo-progress:` keys. An invalid entry, or a key with another version, is treated as missing, is **not deleted**, and affects no other entry (O20). Set `evidenceFetchedAt`, `startedAt` and `updatedAt` only as in design 7.3 (the state layer passes the reference time and an injected clock). When a write fails, including a full storage, keep the change in memory, set the "can't save" flag, retry on the next change, and delete nothing (O22). Keep records revived in this session in memory for `listRevived`.
    _Req 8.1–8.3, 8.6, 8.8, 8.10, 8.15–8.17_
  - [x] 9.3 Write the storage unit and property tests, including source independence, the other-version key, key and schema version consistency, the `evidenceFetchedAt` table in design 7.3, and the storage-full fallback.
    _U11, U16, U17, P13_
  - [x] 9.4 Write the cache and progress namespace test as an **integration/regression test**: with both `graverepo:` and `graverepo-progress:` keys present, the data layer's cleanup removes only cache keys, and the progress store never touches `graverepo:` keys. Cache cleanup stays the data layer's responsibility.
    _Req 8.2, 8.9_ _I4_

- [x] 10. Ritual state
  - [x] 10.1 Write the ritual session state and the actions in design 8.1 (`openRitual`, `applyStageChange`, `toggleItem`, `markRevived`, `listRevived`, `closeRitual`), starting with the demo path. Enforce the stage, tick and revive rules through the domain functions, not controls. A failed or cancelled detail request creates **no** progress entry. A progress entry is created only when the visitor moves stage, ticks or revives. Supply the display context (locale and time zone, read once, with the fallback) to the wording module (O21).
    _Req 1.5–1.8, 6.13, 7.1, 10.2, 10.6, 8.17, 11.10_
  - [x] 10.2 Write `ritual-requests.ts`: the state layer creates and aborts `AbortController`s, attaches a request token to each `openRitual`, ignores `cancelled` results, and drops late results from replaced requests so they cannot change the current session or storage. Request ownership stays in the state layer.
    _Req 10.4, 10.6_
  - [x] 10.3 Add plan-changed handling: keep ticked IDs, recompute progress, and expose a flag for the note only when the new reference time differs from the saved `evidenceFetchedAt` and a saved ticked ID is not among the new plan's item IDs (Req 8.11, O23 Option A). Read the stored value before the first write of the session. Do not store the old plan, do not change the entry schema, and do not show the note merely because data was refreshed or when the plan only gains items.
    _Req 8.11_
  - [x] 10.4 Write the state-layer tests: provenance parity through the state layer, the random-action stage safety model (with `applyStageChange`), the after-revival behaviour, and that marking as revived makes no requests.
    _Req 7.6, 1.7, 6.13_ _P11, P15, U18, I10_

## Group D: Screens (demo data first) [Thu 26 Nov]

Use the components and states in `design-system.md`. Use only approved wording. Final colours, fonts and art are Open. Do not add garden pictures before O12 is approved.

- [x] 11. Shared pieces
  - [x] 11.1 Stage indicator (text, shape, keyboard, current stage exposed).
    _Req 1.3, 12.1_
  - [x] 11.2 Finding row, notice/banner with variants, data-source badge.
    _Req 2.13, 2.14, 4.5, 12.3_
  - [x] 11.3 Focus handling: move focus to the stage heading on stage change. Add polite and alert live regions.
    _Req 6.11, 12.2_

- [x] 12. Necropsy screen
  - [x] 12.1 Show provenance once, the condition with its fact, findings in order with fact and interpretation kept apart, which findings lead to a step, and grouped not-applicable findings. Use one date format, the visitor's locale and local time zone (display context, O21).
    _Req 2, 3.7, 4.5, 11.9, 11.10_
  - [x] 12.2 Loading (with the pending estimate note), error (with the demo offer when allowed), partial and warning states.
    _Req 10.5, 10.9, 12.4_

- [x] 13. Plan screen
  - [x] 13.1 Show the intro, ordered items with because and step, an evidence reveal (raw evidence and labelled derived values), the "couldn't be checked" note, the archived suggestions-only note and the empty-plan message.
    _Req 5.4, 5.6, 5.9, 5.11, 5.12, 5.14_

- [x] 14. Rising and The Living screens
  - [x] 14.1 Rising: checklist with checkbox semantics, progress text or "no steps" wording, meter, save status. **No garden picture until O12 is approved.**
    _Req 6.1, 6.4, 6.8, 6.12_
  - [x] 14.2 "Mark as revived": the disabled state has an accessible explanation (remaining steps as text, linked to the control). A plan with no required items shows progress `null` ("no steps") and still allows revival. Confirmation wording is local-only. When the save fails, show the "couldn't save" wording instead of the confirmation (O22).
    _Req 7.1–7.3, 7.7, 6.4, 8.17_
  - [x] 14.3 The Living: list with captions, source and "Archived on GitHub" labels, the note that GRAVEREPO does not change GitHub, wording that separates local revived status from GitHub status, an empty state and a text list. Include records revived in this session whose save failed (O22).
    _Req 7.8–7.13, 8.17_
  - [x] 14.4 Make sure that no screen file imports a transport, adapter or schema (data-layer task 10.3 covers this check).
    _Req 10.3_

## Group E: Demo integration [Thu 26 – Fri 27 Nov]

- [ ] 15. Demo ritual and checkpoint tests
  - [x] 15.1 **(uses the test-only demo in `tests/dashboard/demo-journey.test.tsx`; the real snapshot is still deferred)** Write the complete demo ritual integration test with `fetch` failing for GitHub. Write the reload test: after a reload, reopening the same repository from the same source restores its saved stage and ticks. Do not require a global pointer or an automatic reopen.
    _Req 8.7, 9.4–9.6_ _I1, I2_
  - [ ] 15.2 Run every demo repository through the analysis. Confirm that at least one gives a non-empty plan. If none does, **stop and report** before any change to the captured snapshot. Do not fabricate or edit GitHub data to force a plan.
    _Req 9.7_ _I8_
  - [ ] 15.3 Write the invalid-entry, plan-changed and reload-after-revival tests. Include an other-version key, which must be left in place. The plan-changed test (I7) covers the O23 cases.
    _Req 8.6, 8.11, 8.16, 1.7, 7.12_ _I3, I7, I11_

## Group F: Live wiring [Fri 27 Nov]

- [ ] 16. Live detail
  - [x] 16.1 **Depends on data-layer task 9.** First verify the actual signatures and return types of `getRepositoryDetail` and `estimateDetailRequests`. Then wire them through the state action with signals and cancellation. Use the default options, never `forceRefresh`, and leave caching to the data layer. Show the existing estimate warning while the request is pending when the estimate result says it applies, then the result's warning, once. Add no request-budget or caching behaviour.
    _Req 8.13, 10.4, 10.9_
  - [x] 16.2 Show data-layer errors using the existing error kinds and the approved voice wording. Offer the demo only when the result's `demoAvailable` is true. Show the rename note from `renamedFrom` as the data layer reports it, without any extra rename behaviour. If the detail cannot be loaded, do not open the ritual or touch saved progress.
    _Req 8.14, 10.5, 10.7_
  - [ ] 16.3 Write the live-path tests with fake data-layer results, including a renamed repository (note shown, progress under the official name).
    _Req 10.7, 10.9, 8.13_ _I5, I6, I9, I12_

## Group G: Accessibility and checkpoint [Fri 27 – Sat 28 Nov]

- [ ] 17. Accessibility pass with the Lantern Mode pass
  - [ ] 17.1 Keyboard-only walk through all four stages. Fix issues.
    _Req 12.1_
  - [ ] 17.2 Check reduced motion, contrast, focus and status-not-by-colour on the ritual screens.
    _Req 12.3–12.6_
  - [ ] 17.3 Record the results in `docs/kiro-journal.md`.

- [ ] 18. Checkpoint support [end of Sat 28 Nov, Malaysia time]
  - [ ] 18.1 Confirm roadmap checks 2 (demo ritual with GitHub blocked), 3 (reload, reopen the same repository, same stage and ticks, see O16), 6 (keyboard and reduced motion) and 7 (ritual tests pass). Record each result in `docs/kiro-journal.md`.
    _Roadmap checkpoint_

## Group H: After the checkpoint (only after core checks pass)

- [ ] 19. Polish [29 Nov and later]
  - [ ] 19.1 **After O12 is approved:** add `gardenStage`, the garden pictures with text equivalents, and its tests (U9, P7). Add animation only after the core journey works, each with a reduced-motion version. Do not move the ritual screens or the checkpoint dates.
    _Req 6.9, 6.10, 12.5_
  - [ ] 19.2 Final garden art once the design-system art decisions are made.
  - [ ] 19.3 Accessibility audit on 1 December (roadmap).

---

## Deferred (not scheduled)

- Undo or reset of a revived repository (O10).
- A global "last open repository" pointer (O16).
- Cross-tab sync of progress.
- Obituary card, time-lapse and other optional features (roadmap priority 6).
- Extra CI conclusion values as actionable (O4).
- A refresh action using `forceRefresh`.
- Any new GitHub analysis (D26).
