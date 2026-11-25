# Kiro journal

Running notes for the Kiro write-up (see `docs/roadmap.md`).

## 22 Nov 2026

### Data-layer task 1.2: GitHub REST API version

- Source: [GitHub Docs, API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions), checked on 22 Nov 2026.
- Current version: `2026-03-10` (released 10 Mar 2026). It is supported with no end date scheduled.
- The older `2022-11-28` stays supported until 10 Mar 2028. Requests with no version header default to it.
- An unsupported version gets `410 Gone`.
- **Value to use in task 3.1:** `2026-03-10`, sent in the `X-GitHub-Api-Version` header. Keep it in one constant in the endpoint catalogue (Req 12.5).
- The value in the spec still matches the docs, so no spec change is needed.

### Data-layer task 1.3: GitHub CORS and readable headers

- Method: a real `fetch` in Chrome 157 from the page `https://example.com` (a cross-origin page, no GRAVEREPO code involved) to `https://api.github.com/users/octocat/repos?per_page=1`. The request sent `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2026-03-10`, with no token. Raw headers were read from the browser's network log. Checked on 22 Nov 2026.
- Result: status 200. GitHub answers with `access-control-allow-origin: *`, so any origin may read the response.
- The custom `X-GitHub-Api-Version` header triggered a preflight (`OPTIONS`, status 204). GitHub's `access-control-allow-headers` includes `X-GitHub-Api-Version`, `If-None-Match` and `Authorization`, so the pinned version header and conditional requests are allowed.
- `access-control-expose-headers` lists `Link`, `Retry-After`, `ETag`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Used`, `X-RateLimit-Resource` and `X-RateLimit-Reset` (among others).
- Read from JavaScript in the page:
  - `link`: present (`rel="next"` and `rel="last"`).
  - `x-ratelimit-limit` (60), `x-ratelimit-remaining`, `x-ratelimit-reset`, `x-ratelimit-used` and `x-ratelimit-resource` (`core`): present.
  - `etag`: present.
  - `retry-after`: read as `null`. GitHub sends it only on rate-limit responses (403 or 429), so a normal 200 cannot show its value. It is in the exposed list, so the browser will let the code read it when it is sent. The secondary rate-limit path (Req 9) still needs a constructed fixture test.
- Conclusion: direct mode can read pagination links, rate-limit headers and `Retry-After` from the browser. No proxy is needed for header access.
- Limit of this check: the page origin was `https://example.com`, not the GRAVEREPO app. `access-control-allow-origin: *` makes the origin irrelevant for unauthenticated requests. The local dev server could not be kept running for the browser tool.

### Data-layer task 2.1: fixture folders

- Created `tests/fixtures/github/captured/` and `tests/fixtures/github/constructed/`, each with a README.
- The specs do not fix a file format, so the READMEs propose one: a `meta` object plus the response `body`. Captured files carry `endpoint`, `capturedAt`, `source`, `capturedWith`, `status` and `redactions`. Constructed files carry `constructed: true` and a `case` sentence. Later tasks (adapter tests, privacy scans) can rely on this.

### Data-layer task 2.2: blocked

- The task needs the GitHub MCP. It is not configured in this environment (`~/.kiro/settings/mcp.json` lists only chrome-devtools and context7, and there is no workspace MCP config). No response was captured and nothing was substituted.

### Data-layer task 2.2: captured fixtures (done)

- The user approved the candidates and the method: Chrome DevTools MCP with unauthenticated `fetch` from `https://example.com`, headers `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2026-03-10`. No token, no new MCP server.
- Rate limit at start: 60 of 60 (checked with `/rate_limit`, which does not count). No pause was needed.
- The README for `ncptunex/Kiroween-2026-GRAVEREPO` was captured first (404 "Not Found", 12:53 UTC).
- 15 files saved in `tests/fixtures/github/captured/`:

| File | Endpoint | Case |
|---|---|---|
| `user.ncptunex.json` | `/users/ncptunex` | User profile |
| `user-repos.ncptunex.json` | `/users/ncptunex/repos?type=owner&sort=pushed&direction=desc&per_page=100` | User repository list (9, no `Link`) |
| `user.vitest-dev.json` | `/users/vitest-dev` | Organisation profile |
| `org-repos.vitest-dev.json` | `/orgs/vitest-dev/repos?type=public&sort=pushed&direction=desc&per_page=100` | Organisation repository list (10, no `Link`) |
| `readme.ncptunex.Kiroween-2026-GRAVEREPO.json` | `.../readme` | No README (404) |
| `repo.ncptunex.Kiroween-2026-GRAVEREPO.json` | `/repos/ncptunex/Kiroween-2026-GRAVEREPO` | Core for the no-README repository |
| `workflow-runs.ncptunex.Kiroween-2026-GRAVEREPO.json` | `.../actions/runs?per_page=1` | No workflow runs (`total_count` 0) |
| `repo.ncptunex.devops-micro-internship-pravinmishra.json` | `/repos/ncptunex/devops-micro-internship-pravinmishra` | Fork, issues turned off |
| `repo.ncptunex.foodstarter.json` | `/repos/ncptunex/foodstarter` | Core for the manifest repository |
| `root-contents.ncptunex.foodstarter.json` | `/repos/ncptunex/foodstarter/contents` | Root listing with `package.json` |
| `workflow-runs.ncptunex.foodstarter.json` | `.../actions/runs?per_page=1` | No workflow runs (`total_count` 0) |
| `repo.atom.atom.json` | `/repos/atom/atom` | Archived |
| `repo.dubzzz.fast-check.json` | `/repos/dubzzz/fast-check` | Core for the workflow-runs repository |
| `workflow-runs.dubzzz.fast-check.json` | `/repos/dubzzz/fast-check/actions/runs?per_page=1` | Workflow runs present |
| `repo.zeit.next.js.json` | `/repos/zeit/next.js` | Renamed: GitHub redirected to `/repositories/70107786`, body is `vercel/next.js`. Recorded in `meta.note`. |

- Every file has `meta` (endpoint, capturedAt, source, capturedWith, status, redactions) and a `headers` object with the `x-ratelimit-*` values (and `link` when sent).
- Redactions (email keys only): `email` in both profiles. `head_commit.author.email` and `head_commit.committer.email` in the fast-check workflow run. Nothing else was changed.
- Scans: no email keys left, no token or `Authorization` patterns. The only `x@y.z` matches are `git@github.com` inside `ssh_url` (SSH clone URLs, not email addresses). The email scan test in a later task must not flag this form.
- Lookups used: 29 of 60. The first batch of 14 responses was fetched but couldn't be saved (the browser tool can't write into the workspace, and its downloads didn't land). The same 14 were fetched again once and handed to a short-lived local receiver on `127.0.0.1`, which was then stopped and deleted. The README file comes from the first request and was not fetched again.
- Not captured: an empty repository (409). The user decided not to create a new repository, so this goes to task 2.3 as a constructed fixture.

### Milestone 1: data-layer foundation (tasks 2.3, 3.1–3.4, 4.1–4.4, 5.1–5.10, done)

- Workflow change: tasks are now grouped into milestones with one report each, instead of a review stop after every checkbox.
- **Extra captures (task 2.2 method, approved repositories only):** Req 14.4 needs captured fixtures for normal conversions, but 2.2 had no commits, issues or branches responses. 8 more were captured with the same unauthenticated browser method (8 lookups used, 23 left in that window): `commits-latest.dubzzz.fast-check`, `commits-since.ncptunex.Kiroween-2026-GRAVEREPO` (since `2025-11-22T00:00:00Z`), `commits-manifest.ncptunex.foodstarter` (`path=package.json`), `issues.dubzzz.fast-check` (63 open items, 33 pull requests), `issues.ncptunex.Kiroween-2026-GRAVEREPO` (none), `branches.dubzzz.fast-check` (exactly 100, a real lower bound), `branches.ncptunex.Kiroween-2026-GRAVEREPO` (2) and `readme.dubzzz.fast-check` (found).
- **Redaction rule widened, still emails only:** commit-signature payloads and one issue body contained email addresses inside text. Those whole fields were removed and listed in `redactions` with "(value contained an email address)". Keys named `emails` inside GitHub App permission lists were also removed by the key rule. That removed no data GRAVEREPO reads. The README content is base64, so it was decoded and scanned before saving: no email addresses.
- **Constructed fixtures (2.3):** 23 files covering:
  - primary limits (403 and 429), secondary limits (403 and 429 with `retry-after`, and 403 by message), a plain 403, and 500, 502 and 503 errors;
  - broken JSON, user and repository 404s, and a workflow-runs 404;
  - a missing login, wrong-type optional fields, invalid list items and private items;
  - a page-1 `Link` header for more than 300 repositories, and 100 open items that are all pull requests;
  - an empty repository (commits 409 and contents 404), issues turned off (410), and a commit whose author and committer dates differ.
  - No constructed 100-branch file was needed, because a real one was captured.
- **Code:**
  - `shared/github-endpoints/`: `catalogue.ts`, `validators.ts` and `build-url.ts`.
  - `src/data/github/`: `types.ts`, `http-response.ts`, `errors/error-kinds.ts`, `errors/classify-response.ts`, `schemas/` and `adapters/`.
- **Judgment calls:**
  - A 429 with no limit headers and no secondary message is treated as a secondary limit with an unknown wait. Design table 5.9 limits `forbidden` to "other 403".
  - A 410 or 404 on a repository endpoint maps to `repo-not-found`, and a 451 maps to `forbidden`.
  - `repo` responses marked private are returned as `repo-not-found`.
  - Optional URL fields keep only `https://` links.
  - The `demoAvailable` values follow design table 5.9 now. Task 6.7 stays open for M2 to confirm.
- **Tests:** fixture-rule checks (README rules), the catalogue and URL builder, the username property test, every error-table row, adapter unit tests on captured fixtures (with constructed ones for edge cases), an email check on all adapter outputs, and the adapter property tests (design 8.9 rows 1, 2 and 5). Fixtures load through `import.meta.glob`, so no `@types/node` was added.
- **Results:** `tsc --noEmit` clean. Vitest: 6 files, 228 tests passed. `vite build` succeeded.
- **Verification gates (read-only):** ritual 1.4 and the types part of dashboard 1.3 match the actual types. The open-issues value now records `itemsRead` and `oldestNotFoundInFirst100`, so the "first 100 open items" wording is supported by an explicit field (ritual O15 decides whether to use it).

### Milestone 3: transport, rate limits and cache (tasks 7.1–7.5 and 8.1–8.4, done)

- The real demo capture (6.5) is deferred until a local GITHUB_TOKEN is set. Tasks 6.5 and 6.8 stay open. No snapshot exists, and none was made up. The test snapshot built from captured fixtures is test data only.
- **Transport (7.1, 7.2):** src/data/github/transport/. A transport never throws, takes only catalogue requests and sends the pinned headers with no Authorization header and no cookies. Failures are marked 
etwork, 	imeout (10 s) or cancelled.
- **Rate limits (7.3, 7.4):** ate-limit.ts and oute-selector.ts. The budget is unknown until the first response and again after the reset time. A primary limit blocks the route until its reset time. A secondary limit and a plain 403 do not block. Nothing is retried. Demo-only mode refuses live requests with a 
etwork error that offers the demo (the closest existing kind, so no new kind was added).
- **Cache (8.1–8.3):** src/data/cache/. Memory in front of localStorage, key graverepo:v1:{type}:{lowercase ids}, Zod-checked payloads, older-version keys removed at start, and only graverepo: keys removed on a write failure (progress keys untouched). orceRefresh skips the cache completely, including the stale fallback. A shared in-flight request is never aborted by one caller cancelling.
- **Tests:** transport, rate-limit and cache tests, including the freshness property test and a property check that cached data is never labelled live. No network, no real localStorage.
- **Next:** task 9 (public functions) needs no snapshot. 9.1–9.7 build on this milestone.

### Wording approval and the demo-first MVP screens (23 Nov 2026)

- **Approved wording (all four groups) recorded** in `.kiro/steering/voice-and-honesty.md` (5.1 to 5.4, 5.8 and new 5.10) and marked approved in the ritual design 10.1 and dashboard design 8.1. Ritual task 1.2 is done. Dashboard task 1.2 is partly done: the introduction, footer note and stage meanings in dashboard design 8.1 were not in the approved list, so the fallback stays (tagline, empty line and controls only; the existing voice line is the footer).
- **Palette chosen** and recorded with contrast ratios in `src/styles/tokens.css` and `design-system.md` (dashboard 4.1).
- **Built:** wording module (`src/components/wording.ts`, in `components/` because `src/ritual/` may not use `Intl`), tombstone view, `App.tsx` wired to the shell, landing, graveyard, tombstone, Necropsy, Plan, Rising (checklist, meter, revive gate), The Living, and the live search wiring through the existing data layer.
- **Decisions made without asking:** a "Note:" label for interpretations, "Leads to a suggested step" for finding rows, "GitHub search" and "Demo graveyard" as source labels, and one plain line for the error boundary. These are interface labels, not claims. Review them in `ui-text.ts` and `wording.ts`.
- **Still deferred:** the real demo snapshot (needs a token and a manual capture). The journey tests use the test-only demo in `tests/ritual/test-demo.ts`. Without a snapshot, "Explore the demo graveyard" shows the demo-unavailable error in the real app.
- **Not done:** manual keyboard walk and browser checks (17.1, 17.2), live search by hand (dashboard 6.3), and 15.2 and 15.3.

### Moonlit Plot visual redesign and O12 (25 Nov 2026)

- **O12 approved by the project owner:** the Rising garden picture is built, with six stages derived from the existing done and total step counts (`src/components/garden-stage.ts`): 0 bare and cracked, 1 moss, 2 sprouts, 3 flowers, 4 glowing mushrooms (all steps ticked), 5 full garden with lantern (marked as revived in GRAVEREPO). The picture is decoration and hidden from assistive technology. The progress text and meter still carry the information.
- **Decisions from the owner:** keep the system font stack (no font assets), no PRODUCT.md or DESIGN.md (the steering documents are enough), no preview page and no older captured data for visual checks. Graveyard and Rising screens wait for the real demo snapshot for a visual check.
- **Built (CSS and SVG only, no dependency):** `src/components/scenery/` (ghost in three poses, night sky, garden plot, tombstone foot art by condition, stage glyphs), arched tombstone cards with a ghost that peeks on hover or focus, a night-sky band and lawn on the graveyard screen, a hero scene on the landing page, a ghost loading indicator, stone-tablet checklist and mint meter, flowerbed cards in The Living, and restyled buttons, panels and notices. A one-sided success notice bar was replaced by a full border.
- **Unchanged:** data layer, state, ritual domain, storage, wording modules and all tests.
