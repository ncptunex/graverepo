# Implementation tasks: graveyard-dashboard

**Status:** Ready for implementation. Do not start implementation before task 1.1 is done.

Each task is small enough to finish and review on its own. Tasks list the requirements they satisfy (for example, _R4.2_) and the tests in `design.md` section 9 (for example, _D-U5_). Work through them in order inside each group.

**Schedule, priorities and checkpoint:** see [`docs/roadmap.md`](../../../docs/roadmap.md). Dates in brackets follow the roadmap. The dashboard is priority 2. It is built on demo data on Wed 25 Nov and wired to live data on Fri 27 Nov. Never move the demo snapshot (24 Nov) or the ritual screens (26 Nov) later to make room for the dashboard.

**Layer rules:** UI triggers state actions. `src/state/` owns requests, cancellation and the calls to the data layer and the ritual. Pure text helpers take `now` and the display context as arguments. See `.kiro/steering/tech.md`. Folder names `src/state/` and `src/ritual/` follow the ritual spec (task 1.3 there).

**Depends on other specs:**
- Data layer: types (task 4.1) and the repository, list and demo adapters (tasks 5.2, 6) before task 2. Live `listRepositories` (task 9.3, 26 Nov) before group F. The dashboard works on the demo without it.
- Ritual: `deriveCondition` (ritual 4.1), dates (2.2), wording (8.1) before task 2.6. `openRitual`, `closeRitual`, `listRevived` (ritual 10.1) before group C is final. Until then use a fake with the same signatures.
- Voice document: the proposed wording in `design.md` 8.1 is added in the same separate steering update as the ritual's (ritual task 1.2). This spec's tasks do not edit that document.

**If behind schedule:** use the cut order in `design.md` section 11.

---

## Group A: Review and verification

- [ ] 1. Review and verification [by Tue 24 Nov]
  - [x] 1.1 **Input needed:** review `requirements.md`, `design.md` and this file. Object to any of DD1 to DD10 you want changed. Silence means they stand.
  - [x] 1.2 **Partly approved and added to `voice-and-honesty.md` (journal 23 Nov). Introduction, footer note and stage meanings are not approved, so the fallback applies:** add the proposed wording in `design.md` 8.1 to `voice-and-honesty.md` together with the ritual's wording. **This spec's tasks do not edit that document.** Until it is approved, use the fallback in 8.1.
    _R12.5_
  - [x] 1.3 **Verification gate (after data-layer tasks 4.1, 5.2 and 6.6)** (done: every listed type and field matches src/data/github/types.ts and rror-kinds.ts)**:** read the actual types and confirm what the dashboard relies on: the data result shape (`ok`, `data`, `provenance`, `warnings`, `refreshError`), the repository list fields (`owner`, `repositories`, `retrievedCount`, `totalPublicCount`, `truncated`, `partial`, `droppedInvalidCount`), the summary fields (`owner`, `name`, `url`, `description`, `primaryLanguage`, `isFork`, `isArchived`, `pushedAt`), the error fields (`kind`, `details`, `demoAvailable`, `retryable`) and the demo graveyard shape (`capturedAt`, `sourceAccounts`, `repositories`). If anything differs, **stop and report**. Do not change the data-layer spec.
    _R3, R4, R8, R9_
  - [x] 1.4 **Done (openRitual(repository, source, { summary }), closeRitual() and listRevived() confirmed; the dashboard session adapts to that shape). The wording module now exists. Verification gate (after ritual task 10.1):** confirm the actual signatures of `openRitual`, `closeRitual` and `listRevived`, and of the ritual's wording and condition functions. If they differ from `design.md`, update the thin adapters in the dashboard state only. Do not edit the ritual spec.
    _R6, R7_

## Group B: Pure helpers and shared state helpers [Wed 25 Nov morning]

- [x] 2. Helpers
  - [x] 2.1 Write `display-context.ts` (reads `Intl` once, fallback `en` and `UTC`) and `clock.ts` (injectable `now()`). If the ritual already created them, reuse them.
    _R9.5, R12_ _D-U6_
  - [x] 2.2 Write `graveyard-filters.ts`: `filterRepositories` and the default filters.
    _R5.1, R5.2_ _D-U1, D-P1_
  - [x] 2.3 Write `provenance-text.ts`: `describeProvenance` for the five situations.
    _R3.3_ _D-U2, D-P2_
  - [x] 2.4 Write `error-text.ts`: one function for every error kind, returning message, demo offer and retry time as structured parts. Use only the voice 5.8 wording.
    _R9.4, R9.5, R8.5_ _D-U3, D-P3_
  - [x] 2.5 Write `list-notices.ts`: truncated, partial (with and without total) and dropped-invalid notices. Never mention private repositories.
    _R3.5, R3.6_ _D-U4_
  - [x] 2.6 **Done 23 Nov (wording module in `src/components/wording.ts`).** Write `tombstone-view.ts` using the ritual's `deriveCondition`, dates and wording (task 1.4 confirms them). No thresholds here. If the ritual wording is not available, show the date fact only.
    _R4.1–R4.9, R4.12_ _D-U5, D-P4_
  - [x] 2.7 **Done.** Write the unit and property tests for 2.1 to 2.6.
    _D-U1–D-U6, D-P1–D-P4_

## Group C: Dashboard state [Wed 25 Nov]

- [x] 3. State actions
  - [x] 3.1 Write `dashboard-session.ts` with the state shape and actions in `design.md` 3, starting with the demo path (`openDemo`, `openTombstone`, `backToGraveyard`, `showLiving`, `goHome`, filters, `refreshRevivedCount`). Do not call any data-layer function at startup.
    _R1.6, R6, R7.1, R8.1, R8.8, R10.1, R11.1–R11.3_
  - [x] 3.2 Add `searchAccount` with the `AbortController`, the request token, dropping of late results and ignoring `cancelled`. A failed search clears the graveyard. Reset filters on a new graveyard. Test against a fake data layer first.
    _R2.4, R2.5, R2.7, R3.1, R9.7_
  - [x] 3.3 Add the 8-second "taking a while" flag (`isSlow`) for a running search. Keep one timer handle, clear it on success, error, `cancelled`, a newer search, `openDemo()` and disposal, and ignore a stale-token callback (`design.md` 3.2).
    _R9.2_ _D-S7_
  - [x] 3.4 Write the state tests.
    _D-S1–D-S7, D-I2_

## Group D: Shell and shared components [Wed 25 Nov]

- [x] 4. Shared pieces
  - [x] 4.1 **Done 23 Nov: palette and ratios recorded in `tokens.css` and `design-system.md`.** Create `styles/tokens.css` and `base.css` (if the ritual has not): colour roles, a 4px spacing scale, one radius family, a system font stack, focus ring, `prefers-reduced-motion`. Choose colour values that meet the contrast ratios in `design-system.md` and record the checked ratios in the file.
    _R13.1, R13.4_
  - [x] 4.2 Write `Notice` (info, warning, error, success, each with an icon and text), `DataSourceBadge` and `LoadingIndicator` (static under reduced motion). Ritual task 11.2 reuses these.
    _R3.3, R9.1, R9.6, R13.3, R13.5, R13.6_
  - [x] 4.3 Write the external-link helper (https only, `rel="noopener noreferrer"`).
    _R3.1, R7.2, R11.7_ _D-I4_
  - [x] 4.4 **Partly done: AppShell, ErrorBoundary and ViewHeading exist with all text as props. App.tsx is not wired until the header, footer and fallback wording is approved.** Write `App.tsx`: skip link, header with logo, "Demo graveyard" and "The Living ({n})", one `main`, footer note, view switch, focus on the view heading, error boundary.
    _R7.1, R10.1–R10.7_

## Group E: Screens on demo data [Wed 25 – Thu 26 Nov]

- [ ] 5. Screens
  - [x] 5.1 `SearchForm`: visible label, one field, one button, Enter submits, error linked to the field, keeps the typed text.
    _R2.1, R2.6, R9.10_
  - [ ] 5.2 **Partly done: name, tagline, search, demo button and empty line exist. The introduction (not approved), stage list and decorative picture are left out under the design 8.1 fallback and the cut order.** Landing: name, tagline, introduction (approved wording or the fallback), search, demo button, stage list, empty line, static decorative picture.
    _R1.1–R1.8_
  - [x] 5.3 `Tombstone` and `ConditionIcon`: one focusable control, accessible name, text plus icon for condition, archived and fork, plain text only, unknown values left out.
    _R4_
  - [x] 5.4 Graveyard screen: heading (live and demo forms), provenance badge, notices, compact search, filter toolbar with a polite count, list, empty-account, empty-filter, loading, error and stale states. Demo shows source accounts and `owner/name`.
    _R2.8, R3, R5, R8.2–R8.4, R8.7, R9_
  - [x] 5.5 Hand-off: activating a tombstone calls `openTombstone`. The ritual view shows "Back to the graveyard".
    _R6_
  - [x] 5.6 The Living screen: list, captions, source and archived labels, GitHub link, note, empty state, optional static picture.
    _R7_
  - [x] 5.7 Write the scan tests (no transports, `fetch`, `api.github.com`, `dangerouslySetInnerHTML` or remote assets in `src/components` and `src/screens`).
    _R11.1, R14.6_ _D-I3_
  - [x] 5.8 **(uses the test-only demo; the real snapshot is still deferred)** Write the demo integration test: open the demo, check the label, open a tombstone, `openRitual` is called with `demo`, `fetch` fails the test if called.
    _R8, R14_ _D-I1_

## Group F: Live wiring [Fri 27 Nov]

- [ ] 6. Live search
  - [x] 6.1 **Depends on data-layer task 9.3.** Verify the actual signature of `listRepositories` and its options, then wire it into `searchAccount`. Pass `signal`. Never pass `forceRefresh`.
    _R2.4, R11.2_
  - [x] 6.2 Show live errors, saved copies and stale labels with the shared modules. Offer the demo only when `demoAvailable` is true.
    _R8.5, R9.4–R9.9_
  - [ ] 6.3 Check live search by hand for one user and one organisation, and the rate-limit, not-found and offline cases (checkpoint checks 4 and 5). Record the results in `docs/kiro-journal.md`.

## Group G: Accessibility and checkpoint [Fri 27 – Sat 28 Nov]

- [ ] 7. Accessibility pass (with the ritual and Lantern Mode pass)
  - [ ] 7.1 Keyboard-only walk: landing, search, filter, tombstone, back, The Living. Fix issues.
    _R13.1, R13.2_
  - [ ] 7.2 Check 320px width, 200% zoom, reduced motion, contrast, focus and status-not-by-colour.
    _R13.4–R13.8_
  - [ ] 7.3 Check the largest demo list (and a 300-item fake list) for responsiveness. If slow, apply the "Show more" cut in `design.md` 11.
    _R3.8_
  - [ ] 7.4 Record the results in `docs/kiro-journal.md`.

- [ ] 8. Checkpoint support [end of Sat 28 Nov, Malaysia time]
  - [ ] 8.1 Confirm roadmap checks 1, 2, 4, 5, 6 and 7 for the dashboard parts, with GitHub blocked for the demo. Record each result in `docs/kiro-journal.md`.

## Group H: After the checkpoint (only after core checks pass)

- [ ] 9. Polish [29 Nov and later]
  - [ ] 9.1 Final decorative art for the landing page, tombstones and The Living, once the design-system art decisions are made. Static first. Animation only after the core journey works, each with a reduced-motion version.
  - [ ] 9.2 Optional: history support for the browser's Back button, if time allows (DD1).
  - [ ] 9.3 Accessibility audit on 1 December (roadmap).

---

## Decision and dependency table

| Task | Depends on |
|---|---|
| 1.3 | Data-layer tasks 4.1, 5.2, 6.6 |
| 1.4 | Ritual task 10.1 |
| 2.4 | Voice 5.8 (approved) |
| 2.6 | Ritual tasks 2.2, 4.1, 8.1 and ritual O18 (approved) |
| 3.1 | Ritual task 10.1 (or a fake) |
| 5.2, 5.4 | Wording in `design.md` 8.1 (or its fallback) |
| 6.1 | Data-layer task 9.3 |
| 9.1 | Design-system art decisions (open) |

No task needs ritual O12 (garden stages). Dashboard decisions DD1 to DD10 are defaults that stand unless you object (task 1.1).

## Deferred (not scheduled)

- A router and per-view URLs (DD1).
- Reopening a revived repository from The Living (DD8).
- Recent searches, saved filters, sorting options.
- Avatars and other remote images (DD3).
- Virtualised lists.
- Garden stages and animation (ritual O12).
