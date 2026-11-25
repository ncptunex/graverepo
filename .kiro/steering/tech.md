# GRAVEREPO technical guide

This document sets the technical conventions for GRAVEREPO. The GitHub data layer is specified in `.kiro/specs/github-data-layer/`, and the schedule is in `docs/roadmap.md`. Visual and wording rules are in `design-system.md` and `voice-and-honesty.md`.

Items marked **(Open)** are not decided. Do not invent an answer in code. Ask, then record it here.

## 1. Approved stack

| Area | Choice | Source |
|---|---|---|
| UI | React | Project decision |
| Build tool | Vite | Project decision |
| Language | TypeScript | Project decision |
| Styling | Plain CSS | Project decision |
| Runtime validation | Zod | D10 |
| Unit and integration tests | Vitest | `github-data-layer` design 8 |
| Property-based tests | fast-check | D11 |
| Browser storage | `localStorage` | D6 and ritual progress |
| Hosting | Vercel (static app; optional Phase 2 proxy) | D1, D20 |

Not part of the stack: a backend, a database, user accounts, a CSS framework, a component library.

The only server code ever allowed is the Phase 2 proxy in `api/github/`, and only if the checkpoint passes (D20, D29). It stores nothing.

**(Open)** Package manager, Node.js version, lint and format tools, React testing helper (for component tests), routing approach. Choose the simplest option when needed and record it here. Do not add a router, a state library or a lint plugin set without a reason (section 9).

## 2. Layers

Keep four layers apart. Each layer has one job.

| Layer | Job | Location | May import | Must not import |
|---|---|---|---|---|
| Data access | All GitHub communication, validation, conversion, caching, demo loading | `src/data/` | `shared/github-endpoints`, Zod | React, UI, ritual logic |
| Domain (ritual) | Pure rules: signals, conditions, plan, progress, Living | **(Open)** folder, proposed `src/ritual/` | Data-layer **types** only | React, `fetch`, `localStorage`, `Date.now()` |
| Application state | Holds current user, repositories, selected tombstone, ritual progress; connects domain and data to the UI | `src/state/` (proposed) | Data-layer public interface, domain | Transports, adapters, schemas |
| UI | Screens and components | `src/screens`, `src/components` | Application state, domain functions, data **types** | Transports, adapters, schemas, `fetch` to GitHub |

The resurrection-ritual spec confirms folder names for the domain and state layers.

Rules:
- Dependencies point downward only: UI → state → domain / data.
  - UI may import application-state functions, pure domain functions and data-layer types.
  - Application state may use the domain layer and the data layer's public interface.
  - Domain and data stay independent of each other's internal implementations.
  - No UI component may import data-layer transports, adapters or schemas.
- **UI components never call GitHub, the proxy or `fetch` for GitHub data.** They trigger application-state actions. The application-state layer calls the data layer's public interface (`lookupUser`, `listRepositories`, `getRepositoryDetail`, `estimateDetailRequests`, `loadDemoGraveyard`, `getRateLimitStatus`).
- Domain logic is pure: the same input always gives the same output. Pass the current time in as an argument, never read the clock inside a rule. This keeps plans deterministic (voice rule 8) and easy to test.
- Domain logic never invents values. Unknown stays unknown (`null`), never `0` or a default.
- State holds results as returned (`ok` or error). It does not reshape them in ways that hide provenance, warnings or errors.

## 3. Folder layout

Follows `github-data-layer/design.md` section 7. Additions are proposals for the other specs to confirm.

```
shared/github-endpoints/     endpoint catalogue, API version, validators
api/github/                  Phase 2 proxy only
src/
  data/                      github/, cache/, demo/ (data-layer spec)
  ritual/                    (proposed) pure domain rules
  state/                     (proposed) application state
  components/                reusable UI pieces
  screens/                   one folder per screen
  styles/                    tokens.css, base.css, shared CSS
scripts/capture-demo/        demo capture, run by hand
tests/
  fixtures/github/captured/  real responses
  fixtures/github/constructed/ hand-made edge cases
  data-layer/                data-layer tests
public/demo/                 only if the demo snapshot exceeds 300 KB (D24)
```

Tests for domain and UI sit under `tests/` in a folder per area. **(Open)** Whether UI tests sit beside components or under `tests/`. Keep one convention.

## 4. Naming and component conventions

- Components: PascalCase, one component per file, file name equals component name (`Tombstone.tsx`).
- Each component keeps its CSS in a file with the same name (`Tombstone.css`). Shared values live in `styles/tokens.css`.
- Functions and variables: camelCase. Types: PascalCase. Constants: UPPER_SNAKE_CASE. Folders and non-component files: kebab-case.
- Booleans start with `is`, `has` or `can`.
- Use the product words in code where they exist: tombstone, necropsy, plan, rising, living. Keep GitHub words for GitHub data (`pushedAt`, `isArchived`).
- Function components with hooks only. Props typed with a named `type`. No `any`. Use `unknown` and narrow it.
- Keep components small. If a component needs more than about 150 lines or several unrelated states, split it.
- Keep logic out of JSX. Compute values above the `return` and name them.
- Prefer clear, plain code over clever code. A beginner should be able to read a function from top to bottom. Add a short comment for any rule that is not obvious, especially domain rules.
- Use named exports. Avoid barrel files except the data layer's public `index`.

### Plain CSS

- CSS variables from `styles/tokens.css` for colour roles, spacing and radius (see `design-system.md`). No raw colour or spacing values in component CSS.
- Class names are prefixed by component (`.tombstone__title`, BEM-like) so styles do not leak. No global element selectors except in `base.css`.
- Mobile-first layout with media queries. A `prefers-reduced-motion: reduce` block for every animation.
- Visible `:focus-visible` styles. Never `outline: none` without a replacement.
- No CSS-in-JS and no CSS framework.

## 5. Data access and validation

- All GitHub requests go through the data layer. It validates every response with Zod, converts it to GRAVEREPO types and returns a data result (`ok: true` with data, provenance and warnings, or `ok: false` with a typed error). It never throws to the UI.
- Never use raw GitHub objects outside `src/data/github/`.
- Dates are ISO 8601 UTC strings. Counts are whole numbers or `null`. Formatting for people happens in the UI, using `Intl` (no date library).
- Anything read from outside the code is untrusted and validated before use: GitHub responses, the demo snapshot, and `localStorage` data (cache entries and ritual progress). Use Zod for each. Unreadable or wrong-version data is discarded and treated as missing.
- The endpoint catalogue is the only place that lists endpoints, query parameters, freshness windows and the API version.

## 6. Errors and cancellation

- UI code handles both branches of every data result. Do not use `try/catch` to cover for missing result handling.
- Map error `kind` and `details` to text using the wording in `voice-and-honesty.md`. Keep user text in one module so wording can be changed in one place. Offer the demo only when `demoAvailable` is true.
- `cancelled` is not shown to the user. Ignore it.
- Cancellation uses `AbortSignal` and is managed by the application-state layer. The state action or effect that starts a request creates the `AbortController` and passes its `signal` to the data layer. It aborts the caller's request when the result is no longer needed or when a newer request replaces it. UI components trigger state actions and do not manage GitHub requests directly. A cancelled caller stops receiving results. The shared network request may keep running (D21).
- Ignore results that arrive after a component has gone away or after a newer request replaced them.
- Wrap the app in one React error boundary with a friendly fallback so an unexpected bug does not show a blank page. Wording from the voice document, no technical details shown to the user.
- Never swallow errors silently. Log unexpected ones to the console during development.

## 7. Ritual progress and browser storage

- Ritual progress is saved in `localStorage`, on this device only (voice section 5.4). It must survive a page reload (roadmap checkpoint check 3).
- Progress contains the user's own choices (ticked steps, revived status, dates), not GitHub data copies beyond what is needed to display it.
- Progress is validated with Zod on read and carries a schema version. Invalid or old data is handled safely and never crashes the app.
- If saving fails, the app continues in memory and tells the user (voice section 5.4).
- Progress is keyed by the repository's official lowercase owner and name, the same identifiers the data layer uses.
- **Key prefixes (decided):** GitHub cache entries use the `graverepo:` prefix (`graverepo:v{schemaVersion}:...`). Ritual progress uses the separate `graverepo-progress:` prefix. The data layer's cache cleanup (requirement 7.11) removes only GitHub cache entries and never touches ritual progress. Ritual code must not write keys under the `graverepo:` prefix, and the cache must not write keys under `graverepo-progress:`.
- No other storage, cookies, analytics or tracking.

## 8. Demo and offline requirements

These come from `github-data-layer` requirement 8 and the roadmap checkpoint.

- The bundled demo graveyard works with no network, no GitHub account and no token.
- The demo is always available on the landing screen, not only after errors.
- The app starts without a successful GitHub request and does not check the rate limit at startup.
- Demo data runs through the same schemas and adapters as live data. Demo data is never shown as a username search result.
- A complete ritual on demo data (Necropsy, Plan, Rising, mark as revived, see it in The Living) makes **zero** requests to GitHub. An automated test enforces this.
- The demo keeps working if the network drops after the app has loaded.
- No runtime requests to fonts, CDNs, analytics or images hosted elsewhere. All assets used by the demo path are bundled or served from the same host.
- Builds and tests never need GitHub. The demo snapshot is captured by hand and committed.

## 9. Dependencies and security

### Dependencies

- Approved: React, Vite, TypeScript, Zod, Vitest, fast-check, and the type packages and build plugins they need.
- A new dependency needs a written reason: what it does, why the platform or existing code cannot do it, its size, and whether it is maintained. Record the decision in the journal.
- Prefer the browser platform (`Intl`, `AbortController`, `fetch`, CSS) over a package.
- Commit the lockfile. Pin versions with the lockfile, and install with a clean-install command in CI.
- Run the package manager's audit before the checkpoint and before submission. Do not ignore a high-severity finding without a note.
- Open-source licence compatibility: only add dependencies compatible with the project's chosen licence. **(Open)** The project licence.

### Security and privacy

- No GitHub token in frontend code, build output, tests or the repository. The capture script reads a token from a local environment variable only and never writes it to a file. Keep `.env` files out of Git.
- Never store or read email addresses. Use login, then name, for authors (D14).
- Exclude private repositories even if GitHub returns them.
- Treat all text from GitHub (names, descriptions, issue titles) as untrusted. Render it as plain text. Never use `dangerouslySetInnerHTML`. GRAVEREPO does not render README content; it only reports whether a README exists.
- Only render links whose URL starts with `https://`. Open external links with `rel="noopener noreferrer"`.
- Validate usernames and repository names with the shared validators before use.
- The demo snapshot and fixtures hold only real captured data, with emails removed. A test fails if an email or token pattern appears (roadmap check 7).
- The `.kiro` folder stays in the repository and is not listed in `.gitignore` (submission rule).

## 10. Testing conventions

- Vitest runs all tests. Property tests use fast-check inside Vitest. No test calls the real GitHub API. Use fixtures and a fake `fetch`.
- Name tests by behaviour: "returns not-applicable when issues are turned off". Group with `describe` per function or component.
- Test domain rules as pure functions with fixed input, including the current time.
- Property tests are for rules with clear invariants. Examples:
  - The same input gives the same plan every time.
  - Unknown (`null`) data never produces a finding or plan item that claims a fact.
  - Plan items always trace to an observed finding.
  - Progress saved then loaded gives the same progress.
  - Progress never exceeds the number of plan steps.
  - Wording functions never output forbidden words (dead, abandoned, and so on) for any input.
- Keep generated values small and seeds reproducible. When a property test fails, save the failing case as a normal example test.
- Normal-conversion tests use captured fixtures. Constructed fixtures are for errors and edge cases only (Requirement 14).
- Use fake timers for time-dependent tests.
- Tests must not depend on the current date or network. A test runs offline.
- Every test required by an approved spec (its requirements, design test strategy and tasks) must be implemented. Tests beyond those requirements need a short justification, for example a bug that was found or a risk the specs do not cover. Do not add tests that only repeat existing ones.
- **(Open)** Component test tool and coverage target.

## 11. Accessibility in code

- Use semantic HTML first (`button`, `a`, `nav`, `main`, `ul`, headings in order). Add ARIA only when HTML cannot express the meaning.
- Every interactive element is reachable and operable by keyboard. Manage focus when screens, dialogs or ritual stages change.
- Use a polite live region for loading and progress messages, and an alert role for errors. Do not move focus unexpectedly.
- Read `prefers-reduced-motion` in CSS and, where JavaScript drives animation, in code.
- Details in `design-system.md`.

## 12. Maintainability

- Make the smallest change that works. No speculative features (YAGNI).
- One clear responsibility per function and file.
- Avoid deep nesting. Use early returns.
- Keep configuration in one place: the endpoint catalogue and section switches for the data layer, the theme tokens for CSS.
- Write code and comments for a reader new to the project. Explain why, not only what.
- Record daily Kiro usage notes in `docs/kiro-journal.md` (roadmap).

## 13. Open decisions

- Package manager and Node.js version.
- Lint and format tools.
- Routing approach (and whether a router is needed at all).
- Application state approach (React built-in state and context is the default unless the ritual spec shows a need).
- Location of domain and state folders (`src/ritual/`, `src/state/` are proposals).
- Component test tool and UI test file location.
- Project open-source licence.
