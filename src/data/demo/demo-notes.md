# Demo graveyard notes

Planning notes for data-layer tasks 6.1 to 6.3 (requirements 8.2, 8.3, 8.5, 8.6; design 4.8; decision D9).
Status: **curated list approved by the project owner.** Tasks 6.1 to 6.3 are complete. The capture script, the loader and the tests are written. **The capture has not been run yet** (task 6.5): it needs `GITHUB_TOKEN` in the shell that runs it. No GitHub request has been made for Milestone 2.

## 0. Approved configuration

- Owner: `ncptunex`.
- Approved curated list (8 repositories): `ncptunex/Kiroween-2026-GRAVEREPO`, `ncptunex/foodstarter`, `ncptunex/devops-micro-internship-pravinmishra`, `atom/atom`, `dubzzz/fast-check`, `ncptunex/mae-learnimal-asgm`, `ncptunex/GrandStay`, `ncptunex/ioop-assignment-sedapMakan`.
- Excluded: `GLORPULSE` (its public description names other people), and `dstr-asgm-p1` and `dstr-asgm-p2` (not added back).
- The optional README check of other owner repositories is **not** performed.
- The GRAVEREPO no-README state is captured **before** a README is added to that repository.
- Capture uses a local `GITHUB_TOKEN` environment variable, at development time only. The token is never printed, logged, committed or stored in project files, fixtures or the snapshot.
- The deployed demo makes **zero** GitHub requests. It reads only the committed snapshot.
- The snapshot size must be **measured** after capture (task 6.5). It is not assumed to be under 300 KB.

All evidence below comes from files already in `tests/fixtures/github/captured/`, captured on 22 November 2026 (about 12:56 UTC). Those files are test fixtures. They are used here as evidence only. The demo snapshot will be captured separately by the capture script (task 6.4), so Requirement 8.7 (snapshot separate from fixtures) still holds.

## 1. Demo owner (task 6.1)

- Confirmed demo owner: **`ncptunex`** (confirmed by the project owner).
- Existing evidence: `user.ncptunex.json` (profile, status 200) and `user-repos.ncptunex.json` (9 public repositories, none private, no `Link` header, so the list is complete).

## 2. The nine required states (Requirement 8.5)

1. Recently active
2. Inactive for more than 12 months
3. Archived
4. Fork
5. Without a README
6. With GitHub Actions runs
7. Without GitHub Actions runs
8. With a root dependency manifest
9. With open issues

"Recently active" and "inactive" are judged here by `pushed_at`, because that is the field the ritual's condition rule reads (`core.pushedAt`, resurrection-ritual design 4.1). "More than 12 months" means before 22 November 2025, counted from the fixture capture date. The exact thresholds belong to the ritual spec. This file does not define them.

## 3. What the owner's account shows (task 6.2)

From `user-repos.ncptunex.json` (captured 2026-11-22). All 9 are public, none archived, and all report `open_issues_count` 0.

| Repository | `pushed_at` | Fork | Issues enabled | Size (KB) | Language |
|---|---|---|---|---|---|
| Kiroween-2026-GRAVEREPO | 2026-11-22 | no | yes | 123 | none |
| foodstarter | 2026-11-21 | no | yes | 168 | TypeScript |
| GLORPULSE | 2026-11-15 | no | yes | 1,050 | JavaScript |
| devops-micro-internship-pravinmishra | 2026-09-05 | **yes** | **no** | 54,505 | none |
| mae-learnimal-asgm | 2026-08-09 | no | yes | 3,669 | C++ |
| dstr-asgm-p2 | 2026-08-09 | no | yes | 299 | C++ |
| dstr-asgm-p1 | 2026-08-09 | no | yes | 1,031 | C++ |
| GrandStay | 2026-04-10 | no | yes | 272 | TypeScript |
| ioop-assignment-sedapMakan | 2026-03-05 | no | yes | 5,369 | C# |

Results for the owner's account alone:

| State | Covered by the owner's account? | Evidence |
|---|---|---|
| 1. Recently active | Yes | Several repositories pushed in the last 2 weeks (table above). |
| 2. Inactive more than 12 months | **No** | The oldest push is 2026-03-05, about 8.5 months before capture. |
| 3. Archived | **No** | `archived` is false for all 9. |
| 4. Fork | Yes | `devops-micro-internship-pravinmishra`: `fork: true` (also `repo.ncptunex.devops-micro-internship-pravinmishra.json`). |
| 5. Without a README | Yes, for one repository | `readme.ncptunex.Kiroween-2026-GRAVEREPO.json`: status 404. See risk R1. |
| 6. With Actions runs | **No evidence** | Only two owner repositories were checked, and both have 0 runs. |
| 7. Without Actions runs | Yes | `workflow-runs.ncptunex.foodstarter.json` and `workflow-runs.ncptunex.Kiroween-2026-GRAVEREPO.json`: `total_count` 0. |
| 8. Root dependency manifest | Yes | `root-contents.ncptunex.foodstarter.json` lists `package.json`. `commits-manifest.ncptunex.foodstarter.json` shows its last change on 2026-11-21. |
| 9. With open issues | **No** | `open_issues_count` is 0 for all 9, and `issues.ncptunex.Kiroween-2026-GRAVEREPO.json` is an empty list. |

Gaps in the owner's account: states 2, 3, 6 and 9.

## 4. Curated external repositories (task 6.3)

Both candidates were already captured in task 2.2 or the Milestone 1 extra captures, so no new lookup was needed to choose them.

| Repository | States it covers | Evidence |
|---|---|---|
| `atom/atom` | 2 (inactive more than 12 months), 3 (archived) | `repo.atom.atom.json`: `archived: true`, `pushed_at` 2023-01-03, `open_issues_count` 993. |
| `dubzzz/fast-check` | 1 (recently active), 6 (Actions runs), 9 (open issues) | `repo.dubzzz.fast-check.json`: `pushed_at` 2026-11-22. `workflow-runs.dubzzz.fast-check.json`: `total_count` 15,422, latest run completed on 2026-11-22. `issues.dubzzz.fast-check.json`: 63 open items, of which 33 are pull requests (so 30 issues). `readme.dubzzz.fast-check.json`: README found. |

Not selected: `vercel/next.js` (captured as the renamed-repository example, formerly `zeit/next.js`). It covers none of the nine states that is not already covered, and its size is 2.6 GB with 4,110 open issues. It is not part of this proposal.

## 5. Coverage summary

| # | State | Covered by | Evidence status |
|---|---|---|---|
| 1 | Recently active | owner repositories, `dubzzz/fast-check` | Verified in fixtures |
| 2 | Inactive more than 12 months | `atom/atom` | Verified in fixture (one repository only) |
| 3 | Archived | `atom/atom` | Verified in fixture |
| 4 | Fork | `ncptunex/devops-micro-internship-pravinmishra` | Verified in fixture |
| 5 | Without a README | `ncptunex/Kiroween-2026-GRAVEREPO` | Verified on 2026-11-22, **may change** (R1) |
| 6 | With Actions runs | `dubzzz/fast-check` | Verified in fixture |
| 7 | Without Actions runs | `ncptunex/foodstarter`, `ncptunex/Kiroween-2026-GRAVEREPO` | Verified in fixtures |
| 8 | Root dependency manifest | `ncptunex/foodstarter` | Verified in fixtures |
| 9 | With open issues | `dubzzz/fast-check` | Verified in fixture (one repository only) |

**Uncovered states: none**, based on existing evidence. Two states rely on a single repository (2 and 9), and one on a repository that will probably change (5).


## 6. Risks and how the approved decisions handle them

- **R1: the no-README state may disappear.** `Kiroween-2026-GRAVEREPO` had no README on 2026-11-22. Decision: capture this repository **before** its README is added. The capture result itself confirms the state: the `readme` response must be the "not found" case (status 404). If it is not, stop and report before using the snapshot, because the required state would be missing.
- **R2: states 2 and 9 depend on one external repository each** (`atom/atom` and `dubzzz/fast-check`). Both are visible in the fixtures. The capture result must be checked against the nine states again (task 6.5).
- **R3: resolved.** `GLORPULSE` is excluded because its public description names other people.
- **R4: demo times are fixed at capture.** The snapshot keeps its capture date (Requirement 8.3). How ages are shown relative to that date is a ritual-spec matter and is not decided here.

## 7. Approved curated list (8 repositories)

Six from `ncptunex` and two external.

| # | Repository | Source | States covered | Reason to include |
|---|---|---|---|---|
| 1 | `ncptunex/Kiroween-2026-GRAVEREPO` | owner | 1, 5, 7 | No README, no workflow runs, very recent |
| 2 | `ncptunex/foodstarter` | owner | 1, 7, 8 | Root `package.json`, no workflow runs |
| 3 | `ncptunex/devops-micro-internship-pravinmishra` | owner | 4 | Fork, issues turned off |
| 4 | `atom/atom` | external | 2, 3 | Archived, last pushed 2023-01-03 |
| 5 | `dubzzz/fast-check` | external | 1, 6, 9 | Workflow runs, open issues, recent |
| 6 | `ncptunex/mae-learnimal-asgm` | owner | none required | Pushed 2026-08-09, an older-looking tombstone |
| 7 | `ncptunex/GrandStay` | owner | none required | Pushed 2026-04-10, older still |
| 8 | `ncptunex/ioop-assignment-sedapMakan` | owner | none required | Pushed 2026-03-05, the oldest owner repository |

Requirement 8.2 (owner's account plus a curated list of other accounts) is met. Requirement 8.3 (record source accounts and the curated list) is met by this section and must be copied into the snapshot at capture (task 6.4).

### Nine-state coverage check for the approved eight

| # | State | Repository | Evidence |
|---|---|---|---|
| 1 | Recently active | #1, #2, #5 | `pushed_at` 2026-11-22, 2026-11-21 and 2026-11-22 |
| 2 | Inactive more than 12 months | #4 `atom/atom` | `pushed_at` 2023-01-03 |
| 3 | Archived | #4 `atom/atom` | `archived: true` |
| 4 | Fork | #3 | `fork: true` |
| 5 | Without a README | #1 | `readme.ncptunex.Kiroween-2026-GRAVEREPO.json`, status 404 |
| 6 | With Actions runs | #5 `dubzzz/fast-check` | `total_count` 15,422 |
| 7 | Without Actions runs | #1, #2 | `total_count` 0 in both |
| 8 | Root dependency manifest | #2 | `package.json` in `root-contents.ncptunex.foodstarter.json` |
| 9 | With open issues | #5 `dubzzz/fast-check` | 63 open items, 33 pull requests, so 30 issues |

All nine states are covered. States 5, 2 and 9 each rest on one repository (see R1 and R2). Repositories #6 to #8 cover no required state and can be removed without losing coverage.

## 8. Estimated request budget (for the capture run, not yet used)

The maximum cost of one repository detail is **9 requests** (design 3.2: 1 core, up to 6 independent sections, up to 2 dependent sections). Dependent requests are skipped when the latest commit is older than 12 months (recent authors) or when no manifest is found, so some repositories will cost fewer than 9.

| Item | Maximum requests |
|---|---|
| 8 repository details (8 × 9) | 72 |
| Account requests: one profile each for `ncptunex`, `atom` and `dubzzz` (no repository-list requests, see section 12) | 3 |
| **Planning maximum** | **75** |

- Without a token, GitHub allows 60 requests an hour, so the planning maximum does not fit in one tokenless hour. This is why the local `GITHUB_TOKEN` was approved.
- Each repository's summary comes from its own `repo` response, so no extra summary requests are made.
- The maximum of 9 per repository is 1 core request (`repo`), 6 independent sections (README, latest commit, open issues, branches, workflow runs, root folder) and 2 dependent sections (recent authors, manifest last change). The README of `Kiroween-2026-GRAVEREPO` is requested first as the no-README check, and that same answer is reused for its detail, so it is never requested twice. 8 repositories × 9 = 72, plus 3 profiles (`ncptunex`, `atom`, `dubzzz`) = **75**.
- The planning maximum is an upper bound. Actual use will be lower. Examples: `devops-micro-internship-pravinmishra` has issues turned off, so its issues request is skipped. `atom/atom` last had a commit in 2023, so its recent-authors request is skipped. A repository without a root manifest skips the manifest request.
- The capture script (task 6.4) should read the remaining allowance from GitHub's response headers and report the number of requests used, without printing the token.
- No request was used to prepare these notes.

## 9. Snapshot size: measurement required

The snapshot size is **not assumed**. It is measured after the capture (task 6.5) and recorded here, together with the delivery option chosen under D24.

What is known before capture:
- Raw fixture sizes: `issues.dubzzz.fast-check.json` is about 434 KB, `readme.dubzzz.fast-check.json` about 63 KB, `branches.dubzzz.fast-check.json` about 30 KB and `user-repos.ncptunex.json` about 56 KB.
- Design 4.8 says the snapshot keeps raw responses with unused fields stripped. How much that saves depends on the stripping rule, which belongs to task 6.4.
- `fast-check` and `atom/atom` (993 open issues) are the likely largest contributors, mainly through their issues responses.

What to record after capture:
- Total snapshot size in KB, and the size of the largest repository's entry.
- The delivery choice: 300 KB or smaller is imported into the bundle. Larger goes to `public/demo/` (D24).
- A re-check of the nine states against the captured data.

| Measurement | Value |
|---|---|
| Snapshot size | _not measured yet_ |
| Largest entry | _not measured yet_ |
| Delivery option | _not chosen yet_ |

## 10. Acceptance review for tasks 6.1 to 6.3

| Task | Acceptance criteria (tasks.md and requirements) | Status |
|---|---|---|
| 6.1 | Get the project owner's GitHub username (Req 8.2). | Met. The owner confirmed `ncptunex`. The profile and list fixtures exist. |
| 6.2 | Check which required states (Req 8.5) the owner's public repositories show, and record the results in `demo-notes.md`. | Met. Section 3 records them from real captured GitHub responses: states 1, 4, 5, 7 and 8 are shown, and 2, 3, 6 and 9 are not. |
| 6.3 | For each missing state, find and verify a suitable public repository from another account, and add it to the curated list. Record any gap. Requires the owner's review (Req 8.2, 8.3, 8.6). | Met. `atom/atom` and `dubzzz/fast-check` were verified from captured responses and cover states 2, 3, 6 and 9. No gap remains and no repository needs creating. The owner reviewed and approved the list. |

Req 8.5 asks for a check "on GitHub". The evidence is real GitHub responses captured on 2026-11-22, not assumptions. Task 6.5 re-checks the states on the final capture.

## 11. Before task 6.4 and the capture run

- The capture script is written and tested with a fake `fetch` (section 12). The real capture (task 6.5) has not been run.
- The capture needs `GITHUB_TOKEN` set in the local shell. It was not set in the environment used to prepare these notes, so set it before the capture run. It must never be printed, logged, committed or written to any file.
- The capture should run before a README is added to `Kiroween-2026-GRAVEREPO` (R1).



## 12. Capture script, loader and tests (Milestone 2 implementation notes)

Files:
- `curated-list.json`: the approved eight repositories and the no-README check repository. A test keeps it in step with section 7.
- `scripts/capture-demo/capture.ts` (logic), `strip.ts` (keeps only the fields GRAVEREPO reads) and `run.mjs` (the launcher).
- `snapshot-schema.ts`, `build-demo-graveyard.ts`, `load-demo-graveyard.ts` and `required-states.ts` in this folder.
- `src/data/github/detail-assembly.ts`: the shared rules for dependent requests and for combining sections. The capture script and the loader both use it, so the snapshot holds exactly the responses the loader needs.

How to run the capture (by hand, once):
1. In the PowerShell window that will run it, set the token for that window only: `$env:GITHUB_TOKEN = "<your token>"`. Do not put it in a file.
2. Optional: `npm run capture-demo -- --dry-run` shows the plan and sends no request.
3. `npm run capture-demo` runs the capture. It refuses to run over an existing snapshot unless `--overwrite` is given.

What the script does, in order:
1. Requests the README of `ncptunex/Kiroween-2026-GRAVEREPO` first. If GitHub does not answer "not found", it stops after that one request and writes nothing.
2. Stops if GitHub reports fewer lookups left than the run may need (up to 75).
3. Requests the three profiles, then each repository's detail through the endpoint catalogue.
4. Stops, writing nothing, on any rate-limit answer, unexpected status, invalid JSON, renamed repository, validation problem, missing required state, email address or token pattern.
5. Only then writes `src/data/demo/graveyard.snapshot.json` and prints its size and the D24 delivery choice. The token is never printed.

Interpretations approved by the project owner:
- **Scoped interpretation of task 6.4 (no repository-list requests).** Task 6.4 says the script "calls every MVP endpoint". For this fixed, approved list of eight repositories, the script does not request `user-repos` or `org-repos`. Each repository's summary is its own `repo` response. Reasons: the lists would bring in repositories outside the approved list (`GLORPULSE`, whose description names other people, the `dstr-asgm` repositories, and many unrelated `atom` repositories), and they would add requests without adding any required state. The script still calls every endpoint a repository detail uses, including the optional sections, and the existing list fixtures already cover the list conversions in tests. This applies to the demo capture only. The live `lookupUser` and `listRepositories` behaviour, the catalogue and the live endpoints are unchanged.
- **"Recently active" and "inactive" (`required-states.ts`).** "Recently active" means `pushed_at` falls within the 12 months before the capture date. "Inactive for more than 12 months" means `pushed_at` is older than that. This is a date-based observation of one GitHub field. It says nothing about why a repository was updated or not, or whether anyone maintains it. It is a demo-coverage check and is not the ritual's condition rule.
- **300 KB** is read as 300,000 bytes (the stricter reading).
- **README ordering.** The capture requests the README of `ncptunex/Kiroween-2026-GRAVEREPO` first. If GitHub does not answer "not found", the script stops after that request and writes no snapshot. The README must therefore not be added to that repository before the capture.
Results of the capture run: _not run yet_.


