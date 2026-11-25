# Implementation tasks: github-data-layer

Each task is small enough to finish and review on its own. Tasks list the requirements they satisfy (for example, _Req 3.4_). Work through them in order, because later tasks depend on earlier ones.

All decisions D1–D29 are approved (see the decision log in `requirements.md`).

**Schedule, priorities and checkpoint:** see [`docs/roadmap.md`](../../../docs/roadmap.md). The day each task group is planned for is shown in brackets.

**Before starting:**
- The project setup must exist: Vite, React, TypeScript and Vitest, from the project-setup step in the roadmap (22 November).
- The GitHub repository must be created on or after 30 October 2026, with `Kiroween 2026` as its root (D13).

**Why the demo comes before live mode:** the demo graveyard (task 6) only needs the catalogue, types and adapters. Finishing it on 24 November lets the dashboard and ritual screens be built against real data while live mode (tasks 7–9) is still in progress.

**If behind schedule:** switch off optional detail sections in this order: manifest, branch count, CI, recent authors (D26). Skip their adapter tasks (5.6, 5.7, 5.8 and the recent-authors part of 5.4) in the same order. Don't add any other GitHub analysis before the checkpoint.

---

## Phase 1 (MVP)

- [x] 1. Preparation [22 Nov]
  - [x] 1.1 Add Zod (runtime dependency, D10) and fast-check (development dependency, D11). Confirm the Zod major version. Confirm Vitest runs an empty test.
  - [x] 1.2 Check GitHub's REST API docs for the current API version, and record it for task 3.1. The docs currently show `2026-03-10`.
    _Req 12.5_
  - [x] 1.3 Confirm from a real browser request that GitHub's CORS settings let the browser read the `Link`, `x-ratelimit-*` and `retry-after` headers. Note the result in `docs/kiro-journal.md`.
    _Req 3.3, 9.1_

- [x] 2. Test fixtures [22 Nov]
  - [x] 2.1 Create `tests/fixtures/github/captured/` and `tests/fixtures/github/constructed/`. Write a short README in each folder explaining its rules.
    _Req 14.1–14.3_
  - [x] 2.2 Using the GitHub MCP, capture the real responses listed in design 8.1. Save each one with its metadata (endpoint, capture date, source) and remove email fields. This is a one-time development step: builds and tests never contact GitHub.
    _Req 8.18, 13.1, 14.2_
  - [x] 2.3 Write the constructed fixtures listed in design 8.1. Mark each one as constructed and describe its case. Add any case that couldn't be captured in 2.2, such as an empty or renamed repository.
    _Req 14.3, 14.5_

- [x] 3. Endpoint catalogue [22 Nov]
  - [x] 3.1 Create the catalogue: pinned API version, Accept header, base URL, every MVP endpoint (including `org-repos`), allowed query values, freshness windows, the known-manifest list, and the optional-section switches (D26).
    _Req 2.1, 2.2, 4.8, 4.13, 7.2, 12.5_
  - [x] 3.2 Add the username validator (D23) and the repository-name validator.
    _Req 1.1, 1.2_
  - [x] 3.3 Add a function that builds a GitHub URL from an endpoint ID and values, and rejects anything not in the catalogue.
    _Req 12.1_
  - [x] 3.4 Write unit tests and the username property test (design 8.9).
    _Req 1.2_

- [x] 4. Data types and errors [23 Nov]
  - [x] 4.1 Define the provenance, rate-limit status, data result, field result and warning types (design 5.1–5.3, 5.7 and 5.10), and the demo graveyard type (design 5.8). The UI specs rely on these shapes.
    _Req 9.2, 10.1, 10.2_
  - [x] 4.2 Define the error kinds, message keys, `details`, `demoAvailable` and `retryable` flags (design 5.9).
    _Req 6, 8.9, 9.9_
  - [x] 4.3 Write the function that turns an HTTP status, headers and body into an error kind, including the primary, secondary and forbidden rules for 403 and 429.
    _Req 6.6–6.8, 9.4–9.6_
  - [x] 4.4 Write unit tests for every row of the error table, using constructed fixtures.
    _Req 6, 9_

- [x] 5. Zod schemas and adapters [23 Nov]
  - [x] 5.1 Write the `user` schema and adapter (user and organisation).
    _Req 1.5, 5_
  - [x] 5.2 Write the repository schema, shared by `user-repos`, `org-repos` and `repo`. Check each list item separately. Drop invalid and private items and count them.
    _Req 2.3, 2.4, 5.5, 6.1, 6.2, 13.3_
  - [x] 5.3 Write the `readme` adapter, treating "not found" as "no README found".
    _Req 6.4_
  - [x] 5.4 Write the `commits` schema and adapters: latest commit, recent authors and manifest last change. Use the committer date. Identify authors by login or name, never email. Handle empty repositories and lower bounds.
    _Req 4.6, 5.9, 5.10, 6.3, 13.2_
  - [x] 5.5 Write the merged `issues` adapter: count excluding pull requests, oldest open issue, lower bound, and the "all 100 are pull requests" case.
    _Req 4.4, 5.6, 5.9_
  - [x] 5.6 (Optional section) Write the `branches` adapter: count and lower bound only.
    _Req 4.4_
  - [x] 5.7 (Optional section) Write the `workflow-runs` adapter, treating no runs as "no workflow runs found".
    _Req 6.5_
  - [x] 5.8 (Optional section) Write the `root-contents` adapter and the manifest detection rule.
    _Req 4.8, 4.9_
  - [x] 5.9 Write adapter unit tests (design 8.2), using captured fixtures for normal cases and constructed fixtures for edge cases.
    _Req 5, 6, 14.4_
  - [x] 5.10 Write the adapter property tests (design 8.9, rows 1, 2 and 5).
    _Req 5.3, 5.4, 6.9, 13.3_

- [ ] 6. Demo graveyard [24 Nov, **unblocks the UI**]
  - [x] 6.1 **Input needed:** get the project owner's GitHub username.
    _Req 8.2_
  - [x] 6.2 Using the GitHub MCP, check which required states (Requirement 8.5) the owner's public repositories show. Record the results in `src/data/demo/demo-notes.md`.
    _Req 8.5_
  - [x] 6.3 For each missing state, find and verify a suitable public repository from another account, and add it to the curated list in `demo-notes.md`. If a state still can't be covered, record the gap and propose options before creating any repository. **Requires your review of the curated list.**
    _Req 8.2, 8.3, 8.6_
  - [x] 6.4 Write the capture script. It uses the catalogue, a local token if one is set, and the curated list. It calls every MVP endpoint (including the optional sections), removes emails and unused fields, and writes the snapshot with its capture date and sources.
    _Req 8.2–8.4, 13.4_
  - [ ] 6.5 Run the capture script. Check the snapshot size and choose the delivery option (D24): import it into the bundle if it's 300 KB or smaller, otherwise place it in `public/demo/`. Commit the snapshot.
    _Req 8.1, 8.7, 8.14, 8.18_
  - [x] 6.6 Write `loadDemoGraveyard`. It runs the snapshot through the same schemas and adapters, returns every repository's detail, sets demo provenance with the capture date, and never contacts GitHub. For a static file, load it once at startup and keep it in memory.
    _Req 8.1, 8.4, 8.11, 8.13–8.15, 10.4_
  - [x] 6.7 Set `demoAvailable` on the error kinds listed in Requirement 8.9.
    _Req 8.9_
  - [ ] 6.8 Write the demo tests (design 8.8). These include the "no constructed fixtures" check, the `demo-notes.md` match, the startup test, the size test, and the **"no GitHub requests" test**, where `fetch` fails the test if called for GitHub.
    _Req 8.8, 8.12, 8.13, 8.14, 8.16, 8.19_

- [x] 7. Direct transport and rate limits [25 Nov]
  - [x] 7.1 Define the transport interface and the raw-response format (design 4.3).
    _Req 12.4_
  - [x] 7.2 Write the direct transport: pinned headers, no token, `nextPage` from the `Link` header, 10-second timeout, transport-failure marking.
    _Req 1.4, 3.3, 6.7, 12.5_
  - [x] 7.3 Write the rate-limit tracker. It records the status per route and reports the budget as "unknown" until the first response. It classifies 403 and 429 responses, blocks a route until reset, and supplies the status for every data result.
    _Req 9.1–9.4, 9.7, 9.8, 9.12_
  - [x] 7.4 Write the Phase 1 route selector: refuse blocked routes, otherwise use direct mode. Support the demo-only configuration. Make no request at startup.
    _Req 8.16, 12.6_
  - [x] 7.5 Write transport and rate-limit tests (design 8.7).
    _Req 9_

- [x] 8. Cache [25 Nov]
  - [x] 8.1 Write the memory and `localStorage` cache with schema version, key format and the storage-failure rule.
    _Req 7.1, 7.10, 7.11_
  - [x] 8.2 Add freshness checks, stale serving with `refreshError`, `forceRefresh`, and the "no partial lists" rule.
    _Req 7.2–7.9_
  - [x] 8.3 Add in-flight deduplication, where a caller's cancellation affects only that caller.
    _Req 7.12, 7.13_
  - [x] 8.4 Write cache tests with fake timers (design 8.6), plus the freshness property test.
    _Req 7_

- [x] 9. Public functions [26 Nov]
  - [x] 9.1 Write `lookupUser`: trim, validate, cache, fetch, adapt, and cancel a replaced lookup.
    _Req 1_
  - [x] 9.2 Write the pagination helper: follow `nextPage` up to 300, and set the truncated and partial flags.
    _Req 3_
  - [x] 9.3 Write `listRepositories`. It chooses the user or organisation endpoint, paginates, sorts with nulls last, applies the caching rules, and never returns demo data for a searched username.
    _Req 2, 3, 7.8, 7.9, 8.10_
  - [x] 9.4 Write `estimateDetailRequests` (design 3.5).
    _Req 9.10, 9.12_
  - [x] 9.5 Write the three-step detail runner. It requests core first, then the independent sections (at most 4 at a time), then the dependent sections. It applies the skip rules and section switches, re-reads the budget after each response, and stops when the budget reaches 0.
    _Req 4.2–4.11, 4.13, 4.14, 9.13, 9.14_
  - [x] 9.6 Write `getRepositoryDetail`: official name, `renamedFrom`, empty repositories, cache, one provenance, and the advisory `may-not-complete` warning.
    _Req 4, 6.3, 6.10, 6.11, 9.11, 9.15, 10.2_
  - [x] 9.7 Write `getRateLimitStatus`.
    _Req 9.3_
  - [x] 9.8 Write the detail runner tests (design 8.4, including the budget cases) and the pagination tests (design 8.5). Add the property tests for sorting, the cap, the request count, "never more than the estimate", "stop at 0" and "never live" (design 8.9).
    _Req 2.6, 3.4, 4.11, 9.10, 9.14, 10.3_
  - [x] 9.9 Write a test confirming that no public function throws, for any fixture or error.
    _Req 6.9_

- [ ] 10. Security, privacy and Phase 1 sign-off [27 Nov]
  - [x] 10.1 Add the token-pattern scan as a test, and as a Kiro hook on save for `src/`, `shared/` and `api/`.
    _Req 11.1_
  - [ ] 10.2 Add the email-pattern scan for the snapshot, captured fixtures and adapter outputs. *(Done for captured fixtures and adapter outputs in `tests/security/security.test.ts`. The snapshot part waits for task 6.5, so this stays open.)*
    _Req 13.5_
  - [x] 10.3 Add a simple test that fails if a file in `src/components` or `src/screens` imports transports, schemas or adapters, or contains `api.github.com`.
    _Req 12.1_
  - [ ] 10.4 Run the full test suite and fix any failures.
  - [ ] 10.5 Do the manual checks in design 8.12. Record the results and the Kiro learnings in `docs/kiro-journal.md`.

- [ ] 11. Checkpoint [end of Sat 28 Nov, Malaysia time]
  - [ ] 11.1 Run the eight checkpoint checks in `docs/roadmap.md` and record each result in `docs/kiro-journal.md`.
    _D29_
  - [ ] 11.2 If all eight pass, Phase 2 may start. If any fail, move task 12 to "Deferred", mark the Phase 2 requirements as "not delivered", and use 29 November to 4 December for fixes, polish and submission. No MVP change is needed either way.
    _D20, D29_

---

## Phase 2 (only if all eight checkpoint checks pass; deadline: end of Mon 30 Nov)

- [ ] 12. Proxy [29–30 Nov]
  - [ ] 12.1 Write the Vercel proxy function: GET only, catalogue allowlist, shared validators, token from the environment, no forwarded visitor headers, 8-second timeout.
    _Req 11.2, 11.4–11.9, 11.11_
  - [ ] 12.2 Add the envelope (including `nextPage`) and the `Cache-Control` values from the catalogue.
    _Req 7.14, 10.5, 11.10_
  - [ ] 12.3 Write the proxy transport, which reads the envelope into the raw-response format.
    _Req 12.4_
  - [ ] 12.4 Extend the route selector: proxy first, and fall back to direct mode once only for transport failures. No fallback for rate limits or GitHub answers.
    _Req 12.7–12.9_
  - [ ] 12.5 Write the Phase 2 tests (design 8.11).
    _Req 11, 12.7–12.9_
  - [ ] 12.6 Create a fine-grained, read-only, public-repositories token, and set `GITHUB_TOKEN` in Vercel. Never commit it.
    _Req 11.2, 11.3_
  - [ ] 12.7 Document the proxy in the README: setup, the shared-allowance abuse risk, and how to switch the proxy off.
    _Req 11.12_
  - [ ] 12.8 Deploy, repeat the manual checks with the proxy, and confirm in DevTools that the browser never sends a token.
    _Req 11.1_

---

## Deferred (not scheduled)

- Last-commit dates for branches, using `commits?sha=` and the Git-style branch-name validator (D4, D17).
- "Outdated dependency" checks against package registries.
- Per-visitor proxy rate limiting (D12).
