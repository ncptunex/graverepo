# Requirements: github-data-layer

## Introduction

The GitHub data layer is the part of GRAVEREPO that fetches public GitHub information, converts it into GRAVEREPO's own data types, caches it, and hands it to the rest of the app.

The rest of the app never talks to GitHub directly. Screens, tombstones and the Resurrection Ritual ask the data layer for data and receive clean, predictable results. Every result says where it came from (live, cached or demo) and when it was fetched.

This spec covers fetching and preparing data only. Deciding what the data *means* (for example, whether 400 days without a commit is a "concern") belongs to the `resurrection-ritual` spec. Showing the data belongs to the `graveyard-dashboard`, `resurrection-ritual` and `lantern-mode` specs. The data layer reports observable facts; it never labels a repository as dead or a contributor as gone.

The project schedule, priorities and checkpoint are in [`docs/roadmap.md`](../../../docs/roadmap.md).

### Delivery phases

| Phase | Contents |
|---|---|
| **Phase 1 (MVP)** | Direct browser calls to GitHub without a token, browser cache, offline demo graveyard, all adapters and error handling. |
| **Phase 2 (after checkpoint)** | Vercel proxy with a read-only token, CDN caching, and fallback from the proxy to direct mode. Built only if all eight checkpoint checks pass at the end of Saturday 28 November 2026, Malaysia time (D29). If the checkpoint is missed, Phase 2 is dropped and the MVP is unaffected. |

Requirements marked **(Phase 2)** are not part of the MVP.

### Priority order

When time is short, higher items win:

1. Demo graveyard and the complete Resurrection Ritual.
2. Live GitHub search and the dashboard.
3. Lantern Mode and accessibility.
4. Visual atmosphere and decoration.
5. Phase 2 proxy.
6. Optional features.

No GitHub analysis beyond this spec is added before the checkpoint (D26).

### In scope

- Looking up a public GitHub user or organisation by username, without login.
- Listing the account's public repositories, with pagination and a maximum.
- Fetching extra details for one repository when its tombstone is opened.
- Converting GitHub responses into GRAVEREPO data types.
- Handling missing fields, empty repositories, renamed repositories and unexpected responses.
- Caching in the browser (Phase 1) and in the shared proxy cache (Phase 2).
- The bundled demo graveyard and the script that captures it.
- Rate-limit tracking and user-facing error information.
- Recording where each piece of data came from.
- Privacy rules for emails and private repositories.
- Test fixtures.

### Out of scope

- Interpreting data into signals, levels or wording, turning signals into revival tasks, and saving ritual progress (`resurrection-ritual`).
- Screens, components and visual design (`graveyard-dashboard`, `lantern-mode`).
- Private repositories, GitHub login and any write action on GitHub.
- Last-commit dates for individual branches (deferred, see D4 and D17).

## Glossary

| Term | Meaning |
|---|---|
| **Data layer** | The GRAVEREPO module that contains all GitHub communication, conversion and caching. |
| **Direct mode** | The browser calls the GitHub API itself, without a token. The only route in Phase 1. |
| **Proxy** | (Phase 2) A small Vercel serverless function that forwards approved requests to GitHub and adds a secret token on the server. |
| **Allowlist** | The fixed list of GitHub endpoints GRAVEREPO may call. The client uses it in Phase 1; the proxy enforces it in Phase 2. |
| **Endpoint catalogue** | The single file that defines the allowlist, allowed query parameters, freshness windows and the pinned GitHub API version. |
| **Transport** | The piece of code that sends a request along one route (direct or proxy) and returns a raw response in one shared format. |
| **Normalised data** | Data converted from GitHub's response format into GRAVEREPO's own consistent types. |
| **Schema** | A Zod description of the shape a GitHub response must have. Used to check responses before converting them. |
| **User profile** | Normalised public information about a GitHub user or organisation. |
| **Repository summary** | Normalised information about one repository, taken from the repository list. Used for tombstones. |
| **Repository detail** | Extra normalised information about one repository, fetched when its tombstone is opened. Used by the Necropsy. |
| **Section** | One part of the repository detail, such as "README" or "latest commit". Each section succeeds or fails on its own. |
| **Field result** | The outcome of one section: `available` (with a value), `unavailable` (with a reason) or `not-applicable` (with a reason). |
| **Official name** | The repository owner and name exactly as GitHub returns them in the repository's own metadata, after any rename. |
| **Provenance** | Where data came from (`live`, `cache` or `demo`), how it was fetched (`direct`, `proxy` or `bundled`), when, and whether it is stale. |
| **Fresh / stale** | A cached entry is fresh while it is younger than its freshness window, and stale afterwards. |
| **Demo graveyard** | A bundled snapshot of real public GitHub data, used when live data is unavailable or when the user chooses it. |
| **Captured fixture** | A real GitHub response saved for tests, changed only to remove email addresses. |
| **Constructed fixture** | A hand-made test response, such as a rate-limit error or broken JSON. Never presented as real GitHub data. |
| **Repository cap** | The maximum number of repositories retrieved for one account (300). |
| **Activity window** | The period used for "recent" activity: the 12 months before the request. |
| **Lower bound** | A count marked "at least", because GitHub returned the maximum number of items and more may exist. |
| **Optional section** | A detail section that can be switched off if development falls behind: manifest, branch count, CI and recent authors (D26). |
| **Request estimate** | The largest number of GitHub requests a repository detail could need, worked out from what is already known about the repository and which sections are switched on (D27). |
| **Request budget** | The number of GitHub requests left in the current rate-limit window, as last reported by GitHub. |
| **Primary rate limit** | GitHub's hourly request allowance. |
| **Secondary rate limit** | GitHub's short-term protection against too many requests in a burst. |
| **Data result** | What every public data-layer function returns: either success or a typed error, both with the current rate-limit status. Functions never throw errors at the UI. |

---

## Requirement 1: Public username lookup

**User story:** As a visitor, I want to type a GitHub username and find that account without signing in, so that I can explore any public graveyard straight away.

### Acceptance criteria

1. WHEN the user submits a username, THE data layer SHALL remove leading and trailing whitespace before validating it.
2. IF the username is empty, is longer than 39 characters, contains characters other than letters, digits and hyphens, or starts with a hyphen, THEN THE data layer SHALL return an `invalid-username` error without contacting GitHub.
3. THE data layer SHALL leave all other username rules to GitHub, and SHALL treat GitHub's "not found" response as `user-not-found`.
4. WHEN a valid username is submitted, THE data layer SHALL request that account's public profile without asking the user to sign in.
5. WHEN GitHub returns a profile, THE data layer SHALL return a user profile containing the login as GitHub spells it, display name, avatar URL, profile URL, account type (user or organisation) and public repository count.
6. WHEN a new lookup starts while an earlier lookup is still running, THE data layer SHALL deliver a `cancelled` result to the earlier caller instead of its data.
7. THE data layer SHALL treat usernames as case-insensitive when building cache keys.

## Requirement 2: Retrieve public repositories for users and organisations

**User story:** As a visitor, I want to see the public repositories of a person or an organisation, so that they can appear as tombstones in the graveyard.

### Acceptance criteria

1. WHEN the user profile's account type is "user", THE data layer SHALL request the account's owned repositories from the user repositories endpoint, sorted by most recent push.
2. WHEN the user profile's account type is "organisation", THE data layer SHALL request the account's public repositories from the organisation repositories endpoint with the public-only filter, sorted by most recent push.
3. WHEN repositories are returned, THE data layer SHALL return a list of repository summaries.
4. THE data layer SHALL include forked and archived public repositories in the list and SHALL mark each one as forked or archived.
5. IF the account has no public repositories, THEN THE data layer SHALL return an empty list as a success, not as an error.
6. THE data layer SHALL order the list by most recent push first, and SHALL place repositories with no push date at the end.

## Requirement 3: Pagination and repository cap

**User story:** As a visitor looking at a large account, I want the graveyard to load quickly and tell me if some repositories were left out, so that I am not left waiting or misled.

### Acceptance criteria

1. THE data layer SHALL request repositories in pages of 100, the largest page size GitHub allows.
2. WHEN GitHub's `Link` response header contains a "next" link, and fewer than 300 repositories have been retrieved, THE data layer SHALL request the next page.
3. THE data layer SHALL find the next page number by reading GitHub's `Link` header, and SHALL NOT guess page numbers.
4. THE data layer SHALL NOT retrieve more than 300 repositories for one account.
5. WHEN 300 repositories have been retrieved and the account has more public repositories, THE data layer SHALL mark the result as truncated and SHALL include both the number retrieved and the account's total public repository count.
6. IF a later page fails after earlier pages succeeded, THEN THE data layer SHALL return the repositories already retrieved, mark the result as partial, and include a warning explaining that some repositories could not be loaded.

## Requirement 4: Repository detail on demand

**User story:** As a visitor, I want detailed information about a repository when I open its tombstone, so that the Necropsy can show real evidence.

### Acceptance criteria

1. WHEN the user opens a tombstone, THE data layer SHALL fetch that repository's detail, and SHALL NOT fetch detail for repositories the user has not opened.
2. THE data layer SHALL fetch the core repository metadata first, and SHALL request the remaining sections only after the core metadata succeeds.
3. IF the core metadata request fails, THEN THE data layer SHALL return that error without sending any other detail requests.
4. AFTER the core metadata succeeds, THE data layer SHALL fetch these sections, running no more than 4 requests at the same time:
   - README presence,
   - the latest commit on the default branch,
   - open issues (count excluding pull requests, and the oldest open issue) from one request,
   - the number of branches,
   - the latest GitHub Actions workflow run,
   - the root folder listing, used to find a dependency manifest.
5. IF the core metadata shows that issues are turned off for the repository, THEN THE data layer SHALL mark the open-issues section as `not-applicable` with the reason `issues-disabled`, and SHALL NOT request issues.
6. WHEN the latest commit's date is inside the 12-month activity window, THE data layer SHALL request the commits in that window and count their distinct authors.
7. WHEN the latest commit's date is outside the activity window, THE data layer SHALL report zero recent authors without sending a request.
8. WHEN the root folder listing contains a known dependency manifest, THE data layer SHALL request the date the first one found last changed. The known manifests, checked in this order, are: `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`.
9. WHEN the root folder listing contains no known manifest, THE data layer SHALL report "no manifest found in the root folder" without sending another request.
10. THE data layer SHALL return each section as its own field result, and a failed section SHALL NOT prevent the other sections from being returned.
11. THE data layer SHALL NOT send more than 9 requests for one repository detail.
12. WHEN repository detail is requested and a fresh cached copy exists, THE data layer SHALL return the cached copy.
13. THE data layer SHALL let each optional section (manifest, branch count, CI, recent authors) be switched off in one configuration place, and SHALL always keep the core sections: core metadata (including archived status and last push), README, latest commit and open issues.
14. WHEN an optional section is switched off, THE data layer SHALL report it as `not-applicable` with the reason `section-disabled`, and SHALL NOT send its requests.
15. IF development falls behind, THEN optional sections SHALL be switched off in this order: manifest, branch count, CI, recent authors (D26).

## Requirement 5: Normalised data types

**User story:** As a developer of GRAVEREPO, I want every piece of GitHub data in one consistent format, so that the rest of the app does not need to understand GitHub's response formats.

### Acceptance criteria

1. THE data layer SHALL check every GitHub response against a Zod schema, and SHALL convert it into GRAVEREPO data types before returning it.
2. THE data layer SHALL NOT return raw GitHub response objects.
3. THE data layer SHALL represent all dates as ISO 8601 strings in UTC.
4. THE data layer SHALL represent known counts as whole numbers of zero or more, and unknown counts as null.
5. THE data layer SHALL name the repository-level open count `openIssuesAndPullRequestsCount`, because GitHub's `open_issues_count` includes pull requests.
6. WHEN counting open issues for the detail section, THE data layer SHALL exclude items that GitHub marks as pull requests.
7. IF an optional text field is missing or empty, THEN THE data layer SHALL store it as null, and SHALL NOT replace it with placeholder text.
8. THE data layer SHALL NOT invent or estimate values. Every stored value SHALL come directly from a GitHub response or be calculated from values in a GitHub response.
9. WHEN a request returns 100 items, the maximum GitHub sends at once, THE data layer SHALL mark any count calculated from those items as a lower bound.
10. THE data layer SHALL use a commit's committer date as its commit date, so that it matches how GitHub's `since` filter works.

## Requirement 6: Missing fields, empty and renamed repositories, and unexpected responses

**User story:** As a visitor, I want GRAVEREPO to keep working when GitHub data is incomplete or unusual, so that one odd repository does not break the whole graveyard.

### Acceptance criteria

1. IF a repository in the list is missing a required field (ID, name, owner login or web URL), or the field has the wrong type, THEN THE data layer SHALL leave that repository out and add a warning with the number of repositories left out.
2. IF an optional field is missing or has the wrong type, THEN THE data layer SHALL store it as null and continue.
3. IF GitHub reports that a repository is empty (no commits), THEN THE data layer SHALL mark the repository as empty and SHALL set the commit-based and manifest sections to `not-applicable` with the reason `empty-repository`.
4. IF the README request returns "not found", THEN THE data layer SHALL report the README section as available with the value "no README found", and SHALL NOT report an error.
5. IF a repository has no GitHub Actions workflow runs, THEN THE data layer SHALL report the CI section as available with the value "no workflow runs found".
6. IF a response is not valid JSON or fails its schema, THEN THE data layer SHALL return an `unexpected-response` error for that request or section.
7. IF a request takes longer than 10 seconds, THEN THE data layer SHALL cancel it and return a `timeout` error.
8. IF GitHub returns a server error (status 500 or above), THEN THE data layer SHALL return a `github-unavailable` error.
9. THE data layer SHALL return every outcome, including errors, as a data result, and SHALL NOT let errors escape to the UI as uncaught exceptions.
10. THE data layer SHALL use the official name from the repository's core metadata for display and cache keys.
11. WHEN the official name differs from the name that was requested (ignoring letter case), THE data layer SHALL include the requested name as `renamedFrom` in the result.

## Requirement 7: Caching and freshness

**User story:** As a visitor, I want repeat visits to load instantly and to know how old the data is, so that the app feels fast and I can trust what I see.

### Acceptance criteria

1. WHEN data is fetched successfully and completely, THE data layer SHALL store the normalised result in the browser cache, under a key made of the data type and the lowercased official identifiers.
2. THE data layer SHALL use these freshness windows: user profile and repository list, 10 minutes; repository detail, 30 minutes.
3. WHEN a fresh cached entry exists, THE data layer SHALL return it without a network request.
4. WHEN a cached entry is stale, THE data layer SHALL try to fetch live data, and SHALL replace the cached entry if the fetch succeeds.
5. IF a live fetch fails and a stale cached entry exists, THEN THE data layer SHALL return the stale entry, marked as stale, together with the error that prevented the refresh.
6. THE data layer SHALL include the original fetch time in every result, so the UI can show text such as "Checked 4 minutes ago".
7. WHEN the caller asks for a forced refresh, THE data layer SHALL skip the browser cache for that request.
8. THE data layer SHALL NOT cache a repository list that is marked as partial.
9. THE data layer SHALL cache a list that is truncated at the repository cap, because the cap is applied on purpose.
10. THE data layer SHALL store a schema version with each cache entry, and IF an entry has a different schema version or cannot be read, THEN THE data layer SHALL delete it and treat it as missing.
11. IF writing to browser storage fails, THEN THE data layer SHALL remove only the GitHub cache entries (keys that start with `graverepo:`) from browser storage and continue with an in-memory cache for the rest of the session. THE data layer SHALL NOT read, modify or remove ritual progress entries, which use the separate `graverepo-progress:` prefix.
12. WHEN two identical requests are made at the same time, THE data layer SHALL send only one network request and give both callers the same result.
13. WHEN a caller cancels a request that is shared with another caller, THE data layer SHALL stop delivering the result to the cancelling caller only, and SHALL NOT abort the shared network request.
14. (Phase 2) THE proxy SHALL send shared-cache headers so that Vercel's CDN can reuse responses for the same freshness windows.

## Requirement 8: Demo graveyard

**User story:** As a judge or visitor, I want a working demo graveyard even when GitHub cannot be reached, so that I can always try the full Resurrection Ritual.

### Acceptance criteria

1. THE app SHALL include a bundled demo graveyard that loads without a network connection, a GitHub account or an API token.
2. THE demo graveyard SHALL contain only real public GitHub data captured by the capture script, taken from the project owner's GitHub account plus a curated list of public repositories from other accounts.
3. THE demo graveyard SHALL record its capture date, the source accounts and the curated repository list.
4. THE demo graveyard SHALL include repository detail for every repository in it, so that the full Resurrection Ritual works offline.
5. BEFORE the demo is captured, THE project SHALL check on GitHub that the chosen repositories together show these states: recently active, inactive for more than 12 months, archived, fork, without a README, with GitHub Actions runs, without GitHub Actions runs, with a root dependency manifest, and with open issues.
6. IF a required state cannot be found in the owner's account or in suitable public repositories, THEN THE project SHALL record the gap in the demo notes and propose a fix before creating any new repository.
7. THE demo snapshot SHALL be stored separately from both test fixture folders.
8. THE demo snapshot SHALL NOT contain constructed fixtures or any other hand-made data presented as GitHub data.
9. WHEN a live lookup fails with a `rate-limited`, `network`, `timeout`, `github-unavailable` or `proxy-unavailable` error, THE data layer SHALL mark the error as one where the demo graveyard can be offered.
10. THE data layer SHALL NOT show demo data as if it belonged to a username the user searched for.
11. THE data layer SHALL check the demo data with the same schemas and adapters as live data.
12. IF the demo data fails validation, THEN THE data layer SHALL return a clear `demo-unavailable` error, and the automated tests SHALL fail.
13. WHILE the demo graveyard is in use, including loading it, opening its repositories and completing a Resurrection Ritual, THE data layer SHALL NOT send any request to GitHub.
14. THE demo snapshot SHALL be included in the deployed app (D24). IF the snapshot is 300 KB or smaller, THEN it SHALL be imported into the app bundle. IF it is larger, THEN it SHALL be deployed as a static file alongside the app and loaded when the app starts.
15. THE demo SHALL NOT depend on GitHub or any other external data service, and SHALL keep working after the app has loaded even if the network becomes unavailable.
16. THE app SHALL start without needing a successful GitHub request, and SHALL NOT check the GitHub rate limit at startup.
17. THE demo graveyard SHALL be available at all times, not only after an error.
18. Building the app and running its automated tests SHALL NOT need access to GitHub. The demo snapshot is captured by hand and committed to the repository.
19. AN automated test SHALL fail if any GitHub request is attempted while the demo is loaded and a demo Resurrection Ritual is completed. This spec provides the data-layer part of the test (loading the demo and reading every demo repository's detail). The `resurrection-ritual` spec extends it to the full ritual.

## Requirement 9: Rate limits and user-facing messages

**User story:** As a visitor, I want a clear, friendly explanation when GitHub limits requests, so that I know when I can try again and what I can do meanwhile.

### Acceptance criteria

1. WHEN any GitHub response is received, THE data layer SHALL record the rate-limit values in the response headers: limit, remaining and reset time.
2. THE data layer SHALL include the latest rate-limit status (limit, remaining, reset time, route, and whether a token was used) in every data result, including errors.
3. THE data layer SHALL also provide the latest rate-limit status on request, without contacting GitHub.
4. IF GitHub responds with status 403 or 429 and the remaining count is 0, THEN THE data layer SHALL return a `rate-limited` error of type `primary`, including the reset time.
5. IF GitHub responds with status 403 or 429 and includes a `retry-after` header, or the message mentions a secondary rate limit, THEN THE data layer SHALL return a `rate-limited` error of type `secondary`, including the wait time.
6. IF GitHub responds with status 403 for any other reason, THEN THE data layer SHALL return a `forbidden` error, and SHALL NOT describe it as a rate limit.
7. WHILE a primary rate limit is in effect, THE data layer SHALL NOT send further requests through the limited route until the reset time, and SHALL return cached data where it exists.
8. THE data layer SHALL NOT automatically retry requests that were rate-limited.
9. THE data layer SHALL give every error a message key and the details needed for a friendly message, for example the reset time, so that the UI can say what happened, when to try again, and whether cached or demo data is available.
10. THE data layer SHALL provide a request estimate for a repository detail before it starts. The estimate SHALL be 0 when a fresh cached copy exists. Otherwise it SHALL count the core request, each switched-on section that may need a request, and each dependent request that cannot yet be ruled out (D27).
11. WHEN a repository detail starts, the request budget is known and the budget is smaller than the request estimate, THE data layer SHALL add a `may-not-complete` warning to the result. The warning SHALL include the estimate, the budget and the reset time.
12. WHEN the request budget is unknown because no GitHub request has been made yet, THE data layer SHALL NOT add the warning, and SHALL report the budget as unknown.
13. WHILE a repository detail is running, THE data layer SHALL update the request budget after every response, because other tabs, apps or people on the same network can use the same allowance.
14. IF the request budget reaches 0, or a primary rate limit is reported, while a repository detail is running, THEN THE data layer SHALL send no further requests for that detail, SHALL mark the remaining sections as `unavailable` with the reason `rate-limited`, and SHALL still return the sections already received.
15. THE request estimate and the `may-not-complete` warning SHALL be advisory only, and SHALL NOT stop the user from starting a repository detail.

## Requirement 10: Data provenance

**User story:** As a visitor, I want to know whether I am looking at live, cached or demo data, so that I can judge how current it is.

### Acceptance criteria

1. THE data layer SHALL attach one provenance to every successful result: the source (`live`, `cache` or `demo`), the route (`direct`, `proxy` or `bundled`), the fetch time (or capture time for demo data), and a stale flag.
2. THE data layer SHALL attach one provenance to a repository detail as a whole, and SHALL NOT attach separate provenance to each section.
3. THE data layer SHALL NOT label cached or demo data as live.
4. WHEN demo data is returned, THE data layer SHALL include its capture date in the provenance.
5. (Phase 2) WHEN live data comes from the proxy's shared cache, THE data layer SHALL use the time the proxy originally contacted GitHub as the fetch time.

## Requirement 11: Token security and proxy allowlist (Phase 2)

**User story:** As the project owner, I want the GitHub token kept secret and the proxy limited to safe read-only requests, so that the token cannot leak and the proxy cannot be misused.

### Acceptance criteria

1. THE frontend code and build output SHALL NOT contain any GitHub token. This criterion applies from Phase 1.
2. THE proxy SHALL read the GitHub token from a server-side environment variable. IF no token is set, THEN THE proxy SHALL forward requests without a token.
3. THE token SHALL be a fine-grained token limited to read-only access to public repositories.
4. THE proxy SHALL accept only GET requests, and SHALL reject all other methods with status 405.
5. THE proxy SHALL forward only requests that match an endpoint in the endpoint catalogue, and SHALL reject all others without contacting GitHub.
6. THE proxy SHALL check usernames and repository names with the same validators as the client, and SHALL reject requests that fail them.
7. THE proxy SHALL forward only allowlisted query parameters with allowed values, and SHALL drop all other parameters.
8. THE proxy SHALL NOT forward the visitor's cookies or authorisation headers to GitHub.
9. THE proxy SHALL NOT write the token to logs or error messages.
10. THE proxy SHALL return a consistent response containing the GitHub status, the response data, the time it contacted GitHub, the rate-limit values and the next page number (or none).
11. IF GitHub does not respond within 8 seconds, THEN THE proxy SHALL return a timeout response.
12. THE project README SHALL explain that the proxy is shared, that anyone who finds it can use up its hourly allowance, and that the allowlist, input checks and CDN caching reduce but do not remove this risk.

## Requirement 12: Separation from the UI and routes

**User story:** As a developer of GRAVEREPO, I want GitHub communication kept in one place, so that the UI stays simple and the data layer can be tested on its own.

### Acceptance criteria

1. THE app SHALL keep all GitHub communication inside the data layer, and UI components SHALL NOT call GitHub or the proxy directly.
2. THE data layer SHALL offer a small public interface for: looking up a user, listing repositories, getting repository detail, loading the demo graveyard and reading the rate-limit status.
3. THE data layer SHALL accept a cancellation signal and a forced-refresh option on every public function that contacts the network.
4. THE data layer SHALL send all requests through a transport interface, so that a proxy transport can be added in Phase 2 without changing adapters, cache or public functions.
5. THE data layer SHALL read the GitHub API version from one constant in the endpoint catalogue, and SHALL send it with every GitHub request.
6. THE data layer SHALL work in two Phase 1 configurations: direct mode with the demo also available (the normal app), and demo only, with live requests switched off (for local development and tests).
7. (Phase 2) WHEN the proxy cannot be reached or returns its own server error, THE data layer SHALL retry that request once in direct mode, without a token.
8. (Phase 2) IF the proxy reports a GitHub rate limit, THEN THE data layer SHALL NOT fall back to direct mode for that request.
9. (Phase 2) THE data layer SHALL NOT fall back to direct mode for other GitHub answers such as "not found", "forbidden" or "repository empty".

## Requirement 13: Privacy

**User story:** As a GitHub user whose repositories appear in GRAVEREPO, I want my private information left out, so that the app only shows what is meant to be public.

### Acceptance criteria

1. THE data layer, cache, demo snapshot and test fixtures SHALL NOT store email addresses.
2. WHEN counting commit authors, THE data layer SHALL use the author's GitHub login where available, otherwise the author name, and SHALL NOT use or store the email address.
3. THE data layer SHALL exclude any repository marked as private or with a visibility other than public, even if GitHub returns it.
4. THE capture script SHALL remove email fields from GitHub responses before saving them.
5. THE automated tests SHALL fail if an email address appears in the demo snapshot, the captured fixtures or any adapter output.

## Requirement 14: Test fixtures

**User story:** As a developer of GRAVEREPO, I want to know which test data is real and which is hand-made, so that tests are trustworthy and hand-made data never reaches users.

### Acceptance criteria

1. THE project SHALL keep captured fixtures and constructed fixtures in separate folders.
2. EACH captured fixture SHALL have metadata recording the endpoint, the capture date and the source account or repository.
3. EACH constructed fixture SHALL be clearly marked as constructed and SHALL describe the case it represents.
4. Tests of normal (successful) conversions SHALL use captured fixtures only.
5. Constructed fixtures SHALL be used only for error cases and edge cases that cannot reasonably be captured, such as rate limits, server errors, broken JSON and missing fields.

---

## Decision log

All decisions are approved. "Deferred" means approved but not part of the MVP.

| ID | Decision | Final answer |
|---|---|---|
| D1 | Vercel proxy with token | Approved. Implementation deferred to Phase 2 (see D20). |
| D2 | Repository cap | 300 |
| D3 | Open issue counting | Issue list, up to 100 items, pull requests removed, "at least" when it may be incomplete |
| D4 | Branch information | Branch count only in the MVP. Branch-date sampling deferred. |
| D5 | Manifest detection | Root folder only, using the manifest list in Requirement 4.8 |
| D6 | Browser cache storage | `localStorage` |
| D7 | Freshness windows | Profile and repository list: 10 minutes. Detail: 30 minutes. |
| D8 | Direct-mode fallback from the proxy | Postponed to Phase 2 with the proxy |
| D9 | Demo sources | The project owner's GitHub account, plus a curated set of public repositories from other accounts. States are checked on GitHub before capture. New repositories are created only if a required state cannot be found. |
| D10 | Response validation | Zod |
| D11 | Property-based testing | fast-check, with Vitest |
| D12 | Proxy abuse protection | Allowlist, input validation and CDN caching only. The risk is documented in the README. |
| D13 | Repository root | The `Kiroween 2026` folder |
| D14 | Commit author identity | GitHub login where available, otherwise author name. Never email. |
| D15 | Activity window | 12 months |
| D16 | Organisation support | Check the account type. Organisations use the organisation endpoint with `type=public`. Private repositories are always excluded on the client. |
| D17 | Branch last-commit method | Commits endpoint with the `sha` parameter, plus Git-style branch-name validation. Deferred with branch dates. |
| D18 | Fixture layout | Separate `captured/` and `constructed/` folders, with metadata for captured fixtures |
| D19 | Leaner detail requests | Core first, one merged issues request, skip the recent-authors request when the latest commit is outside the activity window |
| D20 | Proxy timing | Option B. Proxy deferred until the core app and demo work. It may start only if all eight checkpoint checks (D29) pass at the end of Saturday 28 November 2026, Malaysia time. It must be deployed and tested by the end of Monday 30 November 2026, or it is dropped and GRAVEREPO ships with direct mode plus the demo. |
| D21 | Simplifications | Cancelling does not abort a shared request. One provenance per detail. The proxy returns `nextPage`. Cache-full handling clears only the GitHub cache entries (`graverepo:` prefix) and never the ritual progress (`graverepo-progress:` prefix); amended 22 November 2026 to protect ritual progress (Req 7.11). Rate-limit status is included in data results. |
| D22 | Partial lists | Not cached |
| D23 | Username validation | 1–39 characters, letters, digits and hyphens, no leading hyphen. GitHub handles the rest. |
| D24 | Demo snapshot delivery | Included in the deployed app. Imported into the bundle if 300 KB or smaller; otherwise deployed as a static file alongside the app and loaded at startup. No dependence on GitHub or any external data service. Works offline once the app has loaded. (Req 8.13–8.19) |
| D25 | Ritual specs | `necropsy-signals`, `revival-plan` and `rising-progress` are combined into one `resurrection-ritual` spec covering signals, plan rules, the Rising and saved progress. |
| D26 | Detail-section cut order | If behind, switch off: 1. manifest, 2. branch count, 3. CI, 4. recent authors. Always keep core metadata, README, latest commit and open issues. No additional GitHub analysis before the checkpoint. (Req 4.13–4.15) |
| D27 | Rate-limit warning | A request estimate is worked out for each detail. A `may-not-complete` warning is given when the known budget is smaller than the estimate. The budget is re-read after every response. If it runs out mid-detail, the remaining sections become `unavailable: rate-limited`. Advisory only. (Req 9.10–9.15) |
| D28 | Roadmap location | `docs/roadmap.md`, linked from this spec. |
| D29 | Checkpoint | Eight checks, listed in `docs/roadmap.md`, at the end of Saturday 28 November 2026, Malaysia time. All eight must pass for Phase 2 to start. |
