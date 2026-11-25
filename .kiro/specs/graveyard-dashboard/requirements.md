# Requirements: graveyard-dashboard

**Status:** Ready for implementation. Defaults chosen in this spec are listed under "Decisions made in this spec". They are small and reversible, and none reopens a decision from another spec.

## Introduction

The dashboard is everything a visitor sees before and around the Resurrection Ritual:

1. A **landing page** that explains GRAVEREPO and offers search and the demo.
2. **Search** for a GitHub user or organisation.
3. The **graveyard**: the account's public repositories as tombstone cards, with filters.
4. The **entry point** from a tombstone into the Resurrection Ritual.
5. **The Living**: the repositories the visitor revived on this device.
6. **Demo mode**, kept separate from live search.
7. The **loading, empty, not-found, rate-limit, offline and error states** for all of the above.

The main journey stays: search, graveyard, tombstone, Necropsy, Plan, Rising, The Living.

The dashboard **shows** data and **starts** the ritual. It never fetches from GitHub itself, never decides what the data means, and never implements ritual rules. It reads public GitHub data only, needs no sign-in and writes nothing to GitHub.

Out of scope here: fetching, caching and validating GitHub data (`github-data-layer`), findings, conditions, plans, progress and the four ritual screens (`resurrection-ritual`), Lantern Mode (`lantern-mode`), garden stages (ritual O12), mascots and final art.

The schedule, priorities and checkpoint are in [`docs/roadmap.md`](../../../docs/roadmap.md). Wording rules are in `.kiro/steering/voice-and-honesty.md`, visual rules in `design-system.md` and layer rules in `tech.md`. A `product.md` was named for this task but does not exist in the repository, so it was not used.

### Priority and cut order

The dashboard is roadmap priority 2, after the demo graveyard and the ritual. It is built on demo data on Wed 25 Nov and wired to live data on Fri 27 Nov. When time is short, higher items win:

1. Landing, demo graveyard, tombstones and the hand-off into the ritual.
2. The Living screen.
3. Live search with its error states (checkpoint checks 4 and 5).
4. Filters.
5. Static decorative garden and tombstone art. No animation before the core journey works.

### Reused decisions and interfaces

| Item | Used for |
|---|---|
| D6, `tech.md` section 7 | The dashboard stores nothing in the browser. It only reads ritual records through `listRevived()`. |
| D21, D27 | One provenance per result. The `may-not-complete` warning belongs to the ritual's detail request. |
| Data-layer public interface | `listRepositories` and `loadDemoGraveyard` (called by the state layer only). |
| Data-layer results | Data result (`ok` with `data`, `provenance`, `warnings`, optional `refreshError`, or `ok: false` with a typed `error`), repository list, repository summary, user profile, demo graveyard, error kinds with `demoAvailable` and `retryable`. |
| Ritual O13 | Decided here: DD2. |
| Ritual O18 (approved) | A tombstone's condition comes from the ritual's `deriveCondition` using the summary and `isEmpty` unknown. |
| Ritual O11 | Shared error text is owned here (DD9). |
| Ritual actions | `openRitual(repoRef, source)`, `closeRitual()`, `listRevived()`. |
| Ritual O16 | After a reload the visitor reopens the same tombstone. There is no "last open" pointer. |

## Glossary

| Term | Meaning |
|---|---|
| **Graveyard** | The list of one account's public repositories (live), or the bundled demo list (demo). |
| **Tombstone** | One repository card in the graveyard. |
| **Source** | `live` (a searched account, including saved copies of live results) or `demo`. This is the ritual's `source` value. |
| **Graveyard view** | The screen showing one graveyard: a live account or the demo, never both. |
| **View** | One of four top-level screens: landing, graveyard, ritual, The Living. |
| **Display context** | `{ locale, timeZone }` from the ritual spec (O21), used for every displayed date. |
| **Provenance label** | The short text built from a data result's provenance (data-layer design 6). |

---

## Requirement 1: Landing page and introduction

**User story:** As a first-time visitor or judge, I want to understand what GRAVEREPO does and start in one click, so that I can try it straight away.

### Acceptance criteria

1. THE landing page SHALL show the name GRAVEREPO, the tagline "Dig up your forgotten code.", a short plain-language introduction, the search form (Requirement 2) and a button to explore the demo graveyard (Requirement 8).
2. THE introduction SHALL say that GRAVEREPO reads public GitHub data, shows what can be seen about each repository, suggests a plan, and lets the visitor tick it off. IT SHALL say that "revived" is local and that GRAVEREPO does not change anything on GitHub.
3. THE introduction SHALL NOT say or imply that a repository is dead, abandoned or broken, or that GRAVEREPO can fix or repair one.
4. THE landing page SHALL name the four ritual stages (Necropsy, Plan, Rising, The Living) in one short list, with plain meanings (voice section 2).
5. THE demo button SHALL be on the landing page at all times, not only after an error (data-layer requirement 8.17).
6. WHEN the app starts, THE app SHALL NOT send any request to GitHub and SHALL NOT check the rate limit (data-layer requirement 8.16).
7. THE landing page SHALL work with no network once loaded, apart from live search.
8. WHEN nothing has been searched yet, THE page SHALL show "Search for a GitHub username, or explore the demo graveyard." (voice 5.7)

## Requirement 2: Search for a user or organisation

**User story:** As a visitor, I want to type a GitHub name and see that account's repositories, so that I can explore any public graveyard.

### Acceptance criteria

1. THE search form SHALL have one visible label ("GitHub username or organisation"), one text field and one submit button. IT SHALL be reachable and usable by keyboard, and pressing Enter SHALL submit.
2. THE app SHALL pass the typed text to the data layer through a state action, and SHALL NOT trim, lower-case or validate it in a way that differs from the data layer. THE data layer owns trimming, validation and case rules (data-layer requirement 1).
3. THE same field SHALL accept a user or an organisation. THE app SHALL NOT ask which one. THE data layer chooses the endpoint from the account type.
4. WHEN a search is submitted, THE app SHALL call `listRepositories` once through the state layer. IT SHALL NOT call `getRepositoryDetail` for any repository.
5. WHEN a new search is submitted while an earlier one is running, THE state layer SHALL abort the earlier request, and SHALL drop its late result so it cannot replace the newer one. A `cancelled` result SHALL show nothing.
6. WHEN the data layer returns `invalid-username`, THE error text SHALL appear next to the field and be linked to it (design system 5.7). The field keeps what the visitor typed.
7. THE app SHALL NOT use the demo graveyard as a search result, and SHALL NOT substitute demo data when a search fails.
8. THE search form SHALL also be available on the graveyard view, so the visitor can search another account without going back.
9. THE app SHALL NOT store searches, usernames or results in browser storage. The data layer's own cache is separate and unchanged.
10. THE app SHALL NOT show or request GitHub avatar images or any other image hosted elsewhere (DD3).

## Requirement 3: The graveyard

**User story:** As a visitor, I want to see an account's repositories clearly, with where the data came from and anything that is missing.

### Acceptance criteria

1. WHEN a search succeeds, THE app SHALL show the graveyard view with the heading "Graveyard of {login}" (login as GitHub spells it), the account type in text ("Organisation" when it is one), a link to the GitHub profile (only when its URL starts with `https://`), and the repositories as tombstones.
2. THE tombstones SHALL appear in the order the data layer returns (most recent push first, no push date last). THE dashboard SHALL NOT re-sort them.
3. THE graveyard SHALL show the provenance label once for the whole list, using the data-layer labels (design 6): "Fresh from GitHub, just now", "Saved copy from {age}", "Saved copy from {age}. We couldn't refresh it: {reason}", "Demo graveyard, captured on {date}". IT SHALL show the exact time in a `title` attribute. IT SHALL NEVER label a saved copy or demo data as live. THE label SHALL be chosen only from the `provenance` (and `refreshError`) of the result actually returned. A successful result SHALL NOT be assumed to be fresh from GitHub.
4. THE graveyard SHALL show the count as "{n} repositories", or "Showing {shown} of {n} repositories" while filters hide some (voice 5.7).
5. WHEN the list is truncated, THE app SHALL show "Showing the {n} most recently updated of {total} repositories." WHEN it is partial, THE app SHALL show "Some repositories couldn't be loaded. Showing {n} of {total}." (voice 5.9) WHEN the total is unknown, THE note SHALL omit "of {total}". The count in these notes is a count, never a lower bound.
6. WHEN items were left out because they were invalid, THE app SHALL show "{n} repositories couldn't be shown." and SHALL give no reason. THE app SHALL NOT mention private repositories, by name or by count.
7. WHEN the account has no public repositories, THE app SHALL show "{name} has no public repositories yet. Nothing to dig up here." (voice 5.7)
8. THE graveyard SHALL remain responsive with 300 tombstones (the repository cap). Per-tombstone decoration SHALL be light and static.
9. THE graveyard SHALL NOT send any request when the visitor filters, scrolls or focuses a tombstone.

## Requirement 4: Tombstone cards

**User story:** As a visitor, I want each card to tell me the facts at a glance, without judging the repository.

### Acceptance criteria

1. EACH tombstone SHALL show the repository name, a short description when there is one, and a condition with the fact behind it, for example "Resting · last updated 14 months ago".
2. THE condition SHALL come from the ritual's `deriveCondition`, called with the summary's `isArchived` and `pushedAt` and with `isEmpty` unknown (ritual O18). THE reference time SHALL be the list's `provenance.fetchedAt` (the capture date for the demo). THE dashboard SHALL NOT implement or copy any threshold, boundary or label rule.
3. THE card SHALL NOT infer that a repository is empty from missing or unrelated summary fields. "Empty" appears only in the Necropsy.
4. THE condition and the fact SHALL be built with the ritual's wording and date functions, using the display context. THE card SHALL show a relative phrase together with the absolute date, as the ritual does.
5. WHEN `pushedAt` is `null`, THE card SHALL show "Last update not available" and no resting or dormant label.
6. WHEN a repository is archived, THE card SHALL show "Archived" with an icon or shape and text. IT SHALL NOT show anything that says active, healthy or recently updated.
7. WHEN a repository is a fork, THE card SHALL show a fork icon or shape and the text "Fork". WHEN a primary language is known, THE card MAY show it. Unknown values SHALL be left out, never shown as zero, and SHALL NOT be described as "none".
8. WHEN the description is missing, THE card SHALL say "No description provided".
9. EACH status (condition, archived, fork) SHALL be shown by a text label and an icon or shape. Colour MAY be a third cue and SHALL NOT be one of the two required.
10. THE whole tombstone SHALL be one keyboard-focusable control with an accessible name that includes the repository name and its status.
11. THE card SHALL render GitHub text (names, descriptions) as plain text, and SHALL NEVER use `dangerouslySetInnerHTML`.
12. THE card SHALL show no stars, forks counts, topics, language analysis or code analysis. THE dashboard adds no GitHub analysis (roadmap rule).

## Requirement 5: Filters

**User story:** As a visitor with many repositories, I want to narrow the list quickly.

### Acceptance criteria

1. THE graveyard SHALL offer a text filter (matches the name or description, ignoring case), and two checkboxes "Include forks" and "Include archived", both checked by default.
2. FILTERING SHALL be a pure function of the loaded list and the filter values. IT SHALL keep the original order, SHALL never add items and SHALL send no request.
3. WHEN filters hide every repository, THE app SHALL show "No repositories match these filters. Clear the filters to see all {n}." with a working "Clear filters" button.
4. WHEN the filter result changes, THE app SHALL announce the new count politely, without moving focus.
5. FILTER values SHALL NOT be saved. A new search or a new graveyard resets them.
6. THE filters SHALL be usable by keyboard and have visible labels.

## Requirement 6: Entering the Resurrection Ritual

**User story:** As a visitor, I want to open a tombstone and walk through the ritual.

### Acceptance criteria

1. WHEN the visitor activates a tombstone, THE state layer SHALL start the ritual by calling the ritual's `openRitual(repoRef, source)` with the repository's owner and name, its summary (so the ritual can estimate requests), and the graveyard's source (`live` or `demo`). THE dashboard then shows the ritual view.
2. THE dashboard SHALL NOT call `getRepositoryDetail`, `estimateDetailRequests` or any transport. THE ritual's state layer owns the detail request, the estimate, cancellation and progress (ritual requirements 8 to 10).
3. THE dashboard SHALL NOT compute findings, plans, progress or revive status, and SHALL NOT read or write ritual progress except through `listRevived()`.
4. THE source passed SHALL match the graveyard being shown: a demo tombstone SHALL be opened as `demo`, and a live tombstone as `live`. A demo repository SHALL never be opened as live.
5. WHEN the ritual cannot open (a detail error), THE ritual view shows the error, and THE visitor SHALL be able to go back to the graveyard, with the list still loaded.
6. THE ritual view SHALL include a "Back to the graveyard" control that calls `closeRitual()` and returns to the graveyard view with the same list, filters and scroll position where practical. THE visitor SHALL also be able to reach The Living and the landing page from the header.
7. THE dashboard SHALL NOT start a second ritual while one is open. Opening another tombstone happens only from the graveyard view.

## Requirement 7: The Living

**User story:** As a visitor, I want to see the repositories I revived in GRAVEREPO.

### Acceptance criteria

1. THE app SHALL provide a persistent header link "The Living" on every view, with the count of revived repositories (DD2, resolves ritual O13).
2. THE Living SHALL list the repositories returned by the ritual's `listRevived()`, newest first, with the caption "Revived in GRAVEREPO on {date}" (date in the display context), the source label (demo or live), "Archived on GitHub" in text and an icon or shape when `wasArchived` is true, and a link to the repository's GitHub page only when its URL starts with `https://`.
3. THE Living SHALL show the note "GRAVEREPO doesn't change anything on GitHub." and SHALL keep local revived status visibly separate from any GitHub status. IT SHALL NOT show an archived repository as active.
4. WHEN nothing is revived, THE Living SHALL show: "No revived repositories yet. Finish a ritual and it will grow here."
5. THE Living SHALL read local records only. IT SHALL send no request and SHALL work offline.
6. THE Living SHALL include repositories revived in this session whose save failed, because `listRevived()` returns them (ritual O22). THE ritual's "couldn't save" message covers the limitation. THE Living SHALL NOT claim these are saved.
7. THE Living SHALL provide a text list that works without any picture. A static decorative garden or tombstone picture MAY be shown. IT SHALL be hidden from assistive technology and SHALL NOT depend on garden stages (ritual O12).
8. REOPENING a revived repository's ritual from The Living is not part of the MVP (DD8).
9. THE Living SHALL treat every value as untrusted text, and SHALL NOT crash on records it cannot show.

## Requirement 8: Demo mode

**User story:** As a judge, I want a demo that always works and is never confused with a real search.

### Acceptance criteria

1. WHEN the visitor chooses the demo, THE state layer SHALL call `loadDemoGraveyard()` only, and SHALL send no request to GitHub, including while loading and while the visitor opens tombstones and completes a ritual (data-layer requirement 8.13, ritual requirement 9).
2. THE demo graveyard SHALL be labelled "Demo graveyard, captured on {date}" and SHALL show the source accounts it was captured from. ITS heading SHALL be "Demo graveyard", never "Graveyard of {name}".
3. THE app SHALL NEVER present demo data as the result of a searched username, and SHALL NEVER show a searched username next to demo repositories.
4. THE demo's tombstones SHALL use each repository's real owner, shown as "{owner}/{name}", because the demo mixes accounts.
5. WHEN a live search fails and the error has `demoAvailable` true, THE error message SHALL offer the demo. WHEN `demoAvailable` is false, THE message SHALL NOT mention the demo (voice 5.8).
6. THE demo SHALL keep working if the network drops after the app has loaded.
7. WHEN `loadDemoGraveyard` returns `demo-unavailable`, THE app SHALL show "The demo graveyard couldn't be loaded. Please report this." and SHALL NOT offer the demo again.
8. SWITCHING between the demo and a live graveyard SHALL replace the graveyard view. IT SHALL NOT mix tombstones from both.

## Requirement 9: Loading, empty, not-found, rate-limit, offline and error states

**User story:** As a visitor, I want to know what is happening and what I can do next.

### Acceptance criteria

1. EVERY dashboard view that loads or changes data SHALL define loading, empty, error, partial and success states (design system 4.3), with the wording in the voice document.
2. WHILE a search runs, THE app SHALL show "Looking for {name}…" in a polite live region, with a simple indicator that has a static version under reduced motion. THE layout SHALL stay stable. IF the search takes long, THE app SHALL add: "GitHub is taking a while. You can keep waiting or try the demo." THE 8-second timer SHALL be cleared when the search succeeds, fails, is cancelled, or is replaced by a newer search or by the demo, so the line never appears for a finished or replaced search.
3. WHILE the demo opens, THE app SHALL show "Opening the demo graveyard…". It is in memory, so this may be instant.
4. ERRORS SHALL be shown by one shared text module that maps the data layer's error `kind`, `details` and `demoAvailable` to the final wording in voice 5.8: `network`, `timeout`, `rate-limited` (primary and secondary), `github-unavailable`, `unexpected-response`, `forbidden`, `user-not-found`, `invalid-username`, `demo-unavailable`. `repo-not-found` and `proxy-unavailable` are covered by the same module. `cancelled` SHALL give no message. THE ritual uses the same module (DD9).
5. EACH error message SHALL say what happened, what it means for the visitor and what they can do. Retry times SHALL use the display context, with the date when it is not today. `rate-limited` SHALL never be described as the visitor's failure, and `forbidden` SHALL never be described as a rate limit.
6. THE error SHALL be shown with an icon and text, announced with the alert role, and SHALL NOT move focus unexpectedly. FOR `invalid-username` the message is next to the field.
7. WHEN a search fails, THE app SHALL clear the current graveyard and show the error with the search form and, only when `demoAvailable` is true, the demo button (DD4). THE visitor SHALL be able to retry when the error is retryable.
8. WHEN the data layer returns saved data with `refreshError`, THE app SHALL show the list and the label "Saved copy from {age}. We couldn't refresh it: {reason}". The reason uses the shared module.
9. THE app SHALL NOT retry a failed request automatically.
10. THE not-found state ("We couldn't find an account called {name}. Check the spelling.") SHALL keep the search form filled and focused for correction.

## Requirement 10: Navigation and app shell

**User story:** As a visitor using a keyboard or a phone, I want simple, predictable navigation.

### Acceptance criteria

1. THE app SHALL have four views: landing, graveyard, ritual and The Living. THE active view SHALL be application state. THERE SHALL be no router library in the MVP (DD1).
2. THE header SHALL be on every view and contain the logo (links to the landing page), "Demo graveyard" and "The Living ({n})".
3. THE page SHALL have a "Skip to content" link, one `main` landmark, a `nav` landmark for the header links and headings in order.
4. WHEN the view changes, THE app SHALL move focus to the new view's main heading. THE ritual moves focus to its stage heading itself.
5. THE app SHALL be wrapped in one error boundary with a friendly fallback and no technical details (tech.md section 6).
6. AFTER a reload, THE app SHALL open on the landing page. THE browser's Back button leaves the page (known limitation, DD1).
7. THE footer SHALL say: "GRAVEREPO reads public GitHub data only. It doesn't change anything on GitHub."

## Requirement 11: Layers and reuse

**User story:** As the developer of GRAVEREPO, I want the dashboard to respect the approved architecture.

### Acceptance criteria

1. UI components SHALL trigger state actions only. THEY SHALL NOT import data-layer transports, adapters or schemas, call `fetch` for GitHub, or manage `AbortController`s (tech.md sections 2 and 6).
2. THE dashboard state (`src/state/dashboard-session.ts`) SHALL call `listRepositories` and `loadDemoGraveyard` from the data layer's public interface, and the ritual's actions. IT SHALL create the `AbortController` for searches.
3. THE state SHALL keep data results as returned, including provenance, warnings and errors, and SHALL NOT reshape them so provenance is hidden.
4. THE dashboard SHALL reuse the ritual's domain and wording functions for conditions, dates and labels. IT SHALL NOT duplicate threshold, boundary, plan or progress logic.
5. THE dashboard SHALL add no data-layer requests, endpoints, sections or functions, and no new dependencies.
6. THE dashboard SHALL store nothing in the browser (no `localStorage`, cookies or analytics).
7. EXTERNAL links SHALL be rendered only when the URL starts with `https://`, with `rel="noopener noreferrer"`.

## Requirement 12: Wording and honesty

**User story:** As a visitor, I want GRAVEREPO to describe repositories fairly and truthfully.

### Acceptance criteria

1. ALL dashboard text SHALL follow `voice-and-honesty.md` and live in dashboard text modules, selected by keys and filled from data.
2. THE dashboard SHALL NOT use the avoided words (voice section 3) in any text about a repository or its owner, and SHALL NOT claim a reason, intent or permanent state from inactivity.
3. THE dashboard SHALL separate facts (dates, counts, flags) from interpretations (the condition label), and SHALL label the condition as GRAVEREPO's reading by always pairing it with the fact.
4. UNKNOWN SHALL stay unknown. No unknown value is shown as zero, none or a blank that looks like data.
5. WHERE this spec proposes wording not in the voice document (design 8.1), THE wording SHALL be added to the voice document by the project owner before it ships, in the same separate steering update as the ritual's wording (ritual task 1.2). THE implementation SHALL use only approved wording, and SHALL fall back to the existing voice-document lines until then.
6. THE landing page, graveyard and The Living SHALL use "Graveyard", "Tombstone" and "The Living" as product names, with plain wording for facts.

## Requirement 13: Accessibility, motion and responsiveness

**User story:** As a visitor using a keyboard, a screen reader, a phone or reduced motion, I want the dashboard to work for me.

### Acceptance criteria

1. EVERY dashboard control SHALL be usable by keyboard, with a visible focus indicator of at least 3:1 contrast and no keyboard traps.
2. THE journey from the landing page to opening a tombstone, and to The Living, SHALL be completable with the keyboard alone (checkpoint check 6).
3. LOADING and filter-count messages SHALL use a polite live region. Errors SHALL use the alert role.
4. NOTHING SHALL need horizontal scrolling at 320px width. Touch targets SHALL be at least 44×44px. Text and zoom rules in `design-system.md` apply.
5. ANY animation SHALL be subtle, SHALL have a reduced-motion version and SHALL carry no information that is missing without it. THE first version has no animation.
6. STATUS SHALL never depend on colour alone.
7. DECORATIVE pictures SHALL be hidden from assistive technology.
8. THE dashboard SHALL meet the same keyboard, contrast and reduced-motion rules as the ritual. Lantern Mode may add to them and SHALL NOT lower them.

## Requirement 14: Tests

**User story:** As the developer of GRAVEREPO, I want the dashboard rules tested without GitHub.

### Acceptance criteria

1. EVERY test in this spec's design section 9 SHALL be implemented. Tests beyond that list need a short justification (tech.md section 10).
2. TESTS SHALL use Vitest and fast-check, SHALL run offline and SHALL use a fake data layer or fixtures. NO test SHALL call GitHub.
3. THE unit tests SHALL cover filtering, the provenance labels, every error kind's wording, the list notices, the tombstone view and the shared text modules.
4. THE state tests SHALL cover search success, empty and error paths, cancellation of an earlier search, the demo path with no GitHub request, the hand-off to the ritual, startup with no request, and The Living.
5. THE property tests SHALL prove at least: filter properties, provenance honesty, and text safety (no avoided words, no demo mention unless `demoAvailable`).
6. A SCAN test SHALL fail if a file in `src/components` or `src/screens` imports a transport, adapter or schema, calls `fetch`, contains `api.github.com`, uses `dangerouslySetInnerHTML`, or loads an image or font from another host.

---

## Decisions made in this spec

These defaults keep the MVP small. They reopen nothing from other specs. Change one only if you object.

| ID | Decision | Why |
|---|---|---|
| DD1 | No router library. The four views are application state. After a reload the app opens on the landing page. The browser's Back button leaves the page (limitation). `tech.md` lists routing as open, and this is the simplest option. | Saves time and a dependency. History support can be added as polish. |
| DD2 | The entry point to The Living is a persistent header link with a count. **This resolves ritual O13.** | Satisfies ritual requirement 1.9 (reachable at any time) with one control. |
| DD3 | No avatars or other remote images. A ghost or tombstone SVG is used instead. | `tech.md` section 8 forbids runtime requests to images hosted elsewhere, and the avatar would be a live-only request. |
| DD4 | A failed search clears the current graveyard and shows the error. | A heading for one account over an error about another would mislead. |
| DD5 | Search calls `listRepositories` only. `lookupUser` is not used. The profile comes with the list. | One call, one loading state, no extra requests. |
| DD6 | The tombstone condition uses the ritual's `deriveCondition` (ritual O18, default A) and the list's reference time. | Approved already. No new rule. |
| DD7 | Filters: text, include forks, include archived. No extra sorting. Not saved. | Matches voice 5.7 and stays small. |
| DD8 | Items in The Living are not reopenable in the MVP. They show text, caption and a GitHub link. | Reopening needs a detail load. Deferred. |
| DD9 | Shared text modules (`error-text`, `provenance-text`) live in `src/components/` and are owned here. The ritual reuses them. | Ritual O11 assigns shared error text to this spec. |
| DD10 | Visuals are static. A decorative graveyard or garden picture does not depend on ritual O12. | Do not block on O12. |

## Known limitations (accepted unless you object)

- No URLs per view. A reload returns to the landing page, and the browser's Back button leaves the page.
- Relative times ("8 minutes ago") are calculated when a screen renders and do not tick.
- A search failure clears the previous graveyard.
- The graveyard renders every returned tombstone (up to 300) without virtualisation.
- Items in The Living cannot be reopened.
- No recent searches, saved filters or sorting options.
- The tombstone condition cannot show "Empty", because the summary has no `isEmpty` (ritual O18). An empty repository can read "Resting" or "Last update not available" on its tombstone and "Empty" in the Necropsy.
- Opening a live tombstone may send up to 9 requests (ritual and data layer). The dashboard adds none.
