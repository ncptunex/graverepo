# GRAVEREPO voice and honesty

These rules apply to every piece of text in GRAVEREPO: screens, errors, tooltips, empty states, accessible labels, the README, the demo notes and the Devpost text. Visual rules are in `design-system.md`. Data behaviour is defined in `github-data-layer`.

Items marked **(Open)** are not decided yet. Do not invent them in code.

## 1. Core principles

1. **Inactivity is a signal, not proof.** A repository with no recent updates may be finished, stable, paused, moved or simply quiet. GRAVEREPO cannot tell which.
2. **Never state why.** Do not claim to know why a developer stopped working on a repository, or what they intended.
3. **Never say "dead".** Do not call a repository permanently dead, gone, abandoned or failed. Prefer "resting", "dormant" and "last updated".
4. **Facts and interpretations are separate.** Observable GitHub facts (dates, counts, whether a README exists) are stated plainly. Interpretations are labelled as such and use cautious wording ("might", "worth a look").
5. **Be honest about gaps.** If information is unavailable, say it is unavailable, and say why when the reason is known.
6. **Never invent.** No made-up repository data, activity, contributors, technical problems or numbers. Unknown is not zero.
7. **Keep provenance.** Repository data keeps its source (live, saved copy or demo) and time wherever that is available. The data layer attaches one provenance to each repository detail, so every finding in a Necropsy shares the provenance of that detail. Do not show a separate source for each finding.
8. **Deterministic plans.** Revival suggestions come only from observable information and fixed rules. The same data always gives the same plan.
9. **GRAVEREPO does not change GitHub.** It reads public data only. It never edits, fixes or repairs a repository, and the text must never suggest it does.
10. **"Revived" is local.** It means the user completed the ritual in GRAVEREPO. It does not mean the GitHub repository changed.
11. **Respect the repository and its owner.** No harsh judgments, mockery or blame, even in jest.

## 2. Tone

- Friendly, concise, plain language. Short sentences. One idea each.
- Playful where it helps, never at the cost of clarity. A theme word may colour a sentence, but the meaning must be clear without it.
- Calm and reassuring in errors. Say what happened, what it means for the user, and what they can do next.
- No jargon where a plain word works. Say "lookups" or "requests", not "API calls". Say "saved copy", not "cache".
- Address the user as "you". Refer to GRAVEREPO as "we" only for what the app did ("We couldn't reach GitHub").
- Avoid exclamation marks except for light celebration at The Living.
- Use sentence case. Use a full date or a relative time with a title attribute for exact time.

### Theme words

The graveyard theme is atmosphere. Use theme words in headings and flavour, and use plain words for facts.

| Theme word | Allowed use | Plain meaning to keep nearby |
|---|---|---|
| Graveyard | The collection of repositories | "Repositories" |
| Tombstone | One repository card | "Repository" |
| Necropsy | The first ritual stage | "Look at the evidence" |
| Rising | The third ritual stage | "Progress" |
| The Living | Repositories whose local ritual is complete | "Revived in GRAVEREPO" |

**Confirmed rule.** Graveyard, Tombstone, Necropsy, Rising and The Living are accepted product terminology. Death-related wording must never be used to make a claim about a repository or its owner ("dead", "gone", "abandoned", "failed"). Factual descriptions of a repository stay respectful and neutral.

## 3. Words to use and avoid

| Prefer | Avoid |
|---|---|
| resting, dormant | dead, deceased, killed, abandoned, forsaken, rotting |
| last updated {time} ago | died {time} ago, neglected |
| no recent updates | stopped working, gave up, quit |
| might need attention | broken, failing, bad, poor quality |
| not available, couldn't be checked | none, zero, missing (when the truth is "unknown") |
| we found / GitHub shows | the developer didn't, the owner failed to |
| suggested step | fix (unless the user does it), we'll repair |
| saved copy | cache |
| lookups | API requests, rate limit (in user text, unless it clarifies) |

## 4. Facts, interpretations and provenance

### 4.1 Two kinds of statements

| Kind | Example | Rule |
|---|---|---|
| Fact (observable on GitHub) | "Last updated 14 months ago." "No README found." "3 open issues." "Archived on GitHub." | Plain wording. No adjectives. Show the source and time. |
| Interpretation (GRAVEREPO's reading) | "This repository has been quiet for a while." "A README might help new visitors." | Cautious wording. Label as a note or suggestion. Always shown next to the facts it is based on. |

Never state an interpretation as a fact. Never present a guess about intent, quality, or cause.

### 4.2 Provenance labels

These are the labels in `github-data-layer/design.md` section 6. They map to the provenance the data layer supports: source `live`, `cache` or `demo`, a fetch time (the capture date for demo), and a stale flag. Do not add states the data layer cannot report. The Phase 2 label applies only if the proxy is built.

| Situation | Label |
|---|---|
| Live, just fetched | "Fresh from GitHub, just now" |
| Saved copy, fresh | "Saved copy from 8 minutes ago" |
| Saved copy, stale after an error | "Saved copy from 2 hours ago. We couldn't refresh it: {reason}" |
| Demo | "Demo graveyard, captured on {date}" |
| (Phase 2) Shared cache | "From GitHub, checked 6 minutes ago" |

Never label saved or demo data as live. Never present demo data as the result of a username the user searched.

### 4.3 Counts that may be incomplete

When GitHub returned the maximum number of items, the count is a lower bound. Write "at least 100", never "100". For lists capped at 300, say "Showing {n} of {total}".

## 5. Standard wording

Wording below is the standard. Change a pattern here first, then in the app. Text in `{braces}` is filled from data.

### 5.1 Necropsy findings

The Necropsy lists observations only. Each finding has a label and the observed value. The source and time are shown once for the whole detail (section 4.2).

| Finding | Wording when available | Wording when not |
|---|---|---|
| Last update | "Last updated {relative time} ({date})". For a date in the future: "Last updated {date}" with no relative phrase. | "Last update date not available" |
| Latest commit | "Latest commit on {date} by {author}" | "Latest commit couldn't be checked" |
| Archived | "Archived on GitHub" | (no line if not archived) |
| Fork | "A fork of another repository" | (no line if not a fork) |
| README | "README found" / "No README found" | "README couldn't be checked" |
| Open issues | "{n} open issues" / "At least {n} open issues" / "No open issues" (count 0, complete) / "No open issue found. The count may be incomplete." (count 0, lower bound) | "Open issues couldn't be checked" |
| Oldest open issue | "Oldest open issue from {date}" | (no line when not found) |
| Recent authors | "{n} people committed in the last 12 months" / "At least {n}…" | "Recent authors couldn't be checked" |
| Branches | "{n} branches" / "At least {n} branches" | "Branch count couldn't be checked" |
| Automated checks (CI) | "Latest workflow run: {result} on {date}" / "No workflow runs found" | "Workflow runs couldn't be checked" |
| Dependency file | "{file} last changed on {date}" / "No dependency file found in the root folder" | "Dependency file couldn't be checked" |
| Empty repository | "This repository has no commits yet" | n/a |
| Issues turned off | "Issues are turned off for this repository" | n/a |
| Section switched off | Do not show the finding at all | n/a |
| Renamed | "Now named {official name} (you opened {requested name})" | n/a |

Rules:
- Never write "no activity" when the truth is "couldn't be checked".
- "No workflow runs found" and "No README found" are facts, not errors.
- Do not describe "No dependency file found" as a problem. It only covers the root folder and a fixed list of file names, so say that in a short note.

### 5.2 Repository conditions

A condition is a short label on a tombstone, based on observable data. Names and thresholds are defined in the `resurrection-ritual` spec, not here. This document sets the wording rules.

- Labels describe the state, not a verdict. Good: "Resting", "Dormant", "Recently updated", "Archived", "Empty". Bad: "Dead", "Hopeless", "Abandoned".
- Always pair a condition label with the observable fact behind it ("Resting · last updated 14 months ago").
- The label is an interpretation. The time since the last update is the fact.
- A repository with unknown last-update data is "Last update not available". It is not given a resting or dormant label.
- Condition names (approved): "Archived", "Empty", "Last update not available", "Recently updated", "Resting", "Dormant". Thresholds (12 and 24 months) are defined in the `resurrection-ritual` spec. An archived repository is never labelled active or recently updated.

### 5.3 Revival recommendations

- Start from the evidence: "Because {fact}, you could {step}."
- Use soft verbs: "you could", "consider", "a good first step". Not "you must", "you need to", "fix".
- Steps are small, concrete and in the user's control: "Add a README that says what this project does."
- Never promise results ("this will bring your project back").
- Never state a cause: not "your dependencies are broken", but "the dependency file {file} was last changed on {date}. You could check whether it still installs."
- A plan item appears only when its rule's data was observed. If data wasn't available, say what couldn't be checked and give no suggestion based on it.
- Every plan item can show which finding it came from.
- Say that the plan is a suggestion based on public GitHub information. It is not a diagnosis.

Standard intro: "Here's a suggested plan based on what we could see on GitHub."

- Plan item form (approved): "Because {fact}, you could {step}."
- Empty plan (approved): "We didn't find anything to suggest from what we could see."
- Archived repository (approved): "These steps are suggestions only. We can't tell whether they can be done while this repository stays archived."
- Plan changed (approved): "This plan changed because newer GitHub data was available. Your ticks are kept, and progress now counts the current steps."

### 5.4 Rising progress

The Rising shows the user's own progress through the plan. It happens only in GRAVEREPO.

| Situation | Wording |
|---|---|
| Not started | "Nothing planted yet" |
| In progress | "{done} of {total} steps done" |
| All steps done | "All steps done. Ready to mark as revived." |
| Saved | "Progress saved on this device" |
| Cannot save | "We couldn't save your progress on this device. It will be lost when you close this page." |
| Revive disabled (approved) | "1 step left before you can mark this repository as revived in GRAVEREPO." / "{n} steps left before you can mark this repository as revived in GRAVEREPO." |
| No required steps | "No steps" (progress is not a number) |

Rules:
- Progress means steps the user ticked, not changes GRAVEREPO detected on GitHub.
- Do not say a repository is "improving", "healthier" or "better" from ticked steps.
- Progress is saved on the device only. Say so.

### 5.5 The Living

"Revived" is a local label for a ritual the user completed.

| Situation | Wording |
|---|---|
| Section title | "The Living" |
| Item caption | "Revived in GRAVEREPO on {date}" |
| Confirmation | "Marked as revived in GRAVEREPO. This is saved on this device only." |
| Empty | "No revived repositories yet. Finish a ritual and it will grow here." |
| Note near the section | "GRAVEREPO doesn't change anything on GitHub." |

Never write "revived on GitHub", "repository fixed", "back online", "maintained again" or similar. Never show The Living as a GitHub status.

### 5.6 Loading states

Say what is happening. Keep it short. Use the theme lightly.

| Where | Wording |
|---|---|
| Looking up a user | "Looking for {name}…" |
| Loading repositories | "Loading repositories…" |
| Opening a tombstone | "Checking this repository…" |
| Partial detail still loading | "Still checking: {section list}" |
| Demo | "Opening the demo graveyard…" |

If a load takes long, add: "GitHub is taking a while. You can keep waiting or try the demo."

### 5.7 Empty states

| Case | Wording |
|---|---|
| Account has no public repositories | "{name} has no public repositories yet. Nothing to dig up here." |
| No search yet | "Search for a GitHub username, or explore the demo graveyard." |
| No findings for a section | "Nothing to show yet." |
| No results after filtering | "No repositories match these filters. Clear the filters to see all {n}." |
| Empty repository | "This repository has no commits yet." |

Empty means "we looked and found nothing", never "we could not look". Use the unavailable wording for the second case.

### 5.8 Offline and rate-limit errors

The data layer provides each error's `kind`, `messageKey` and details (see `github-data-layer/design.md` section 5.9). The draft messages there are the base for this wording. These are the final lines.

| Kind | Wording |
|---|---|
| `network` (offline) | "We can't reach GitHub from here. Check your connection, or try the demo graveyard." |
| `timeout` | "GitHub didn't answer in time. Try again, or try the demo graveyard." |
| `rate-limited` (primary) | "GitHub allows only a limited number of lookups for each hour. We've used them up for now. You can look again at {time}, or try the demo graveyard." |
| `rate-limited` (secondary) | "Too many lookups at once. Try again in {seconds} seconds." ("1 second" for one). Wait time unknown: "Too many lookups at once. Try again later." Never invent a time. |
| `github-unavailable` | "GitHub seems to be having trouble right now. Try again later, or try the demo graveyard." |
| `unexpected-response` | "GitHub sent something we didn't expect. Try again, or try the demo graveyard." |
| `proxy-unavailable` (Phase 2) | "Our lookup helper isn't answering right now. Try the demo graveyard, or try again later." Without the demo: "Our lookup helper isn't answering right now. Try again later." (approved) |
| `forbidden` | "GitHub won't let us see this one." |
| `user-not-found` | "We couldn't find an account called {name}. Check the spelling." When the name is not known: "We could not find that account. Check the spelling." (approved) |
| `repo-not-found` | "We couldn't find this repository. It may have been renamed, moved or made private." |
| `invalid-username` | "GitHub usernames use letters, numbers and hyphens." |
| `demo-unavailable` | "The demo graveyard couldn't be loaded. Please report this." |
| `cancelled` | No message. |

Rules:
- Mention the demo only when `demoAvailable` is true.
- Say when to try again, if known. Use the user's local time, with the date if it is not today.
- Never call a rate limit a failure of the user. Never describe `forbidden` as a rate limit.
- If saved data is shown instead: "Showing a saved copy from {age}. We couldn't refresh it: {reason}."
- A rate limit during a detail: "GitHub ran out of lookups part-way through. Some sections couldn't be checked. They'll be available after {time}."
- `may-not-complete` warning: "GitHub may run out of lookups before we finish checking this repository. We'll show what we can." It is advisory and never blocks the user. It may also be shown while the request is still loading (approved).
- Mood words such as "lanterns out of oil" may appear as a short heading only, with the plain explanation under it.

### 5.9 Unavailable GitHub data

Use the same pattern everywhere.

| Reason | Wording |
|---|---|
| Section failed | "{Section} couldn't be checked." |
| Rate limit ended the check | "{Section} couldn't be checked because GitHub ran out of lookups. Available after {time}." |
| Section switched off | Do not mention it. |
| Not applicable: empty repository | "Not applicable: this repository has no commits yet." |
| Not applicable: issues turned off | "Not applicable: issues are turned off." |
| Value unknown | "Not available" |
| Partial repository list | "Some repositories couldn't be loaded. Showing {n} of {total}." |
| Truncated list | "Showing the {n} most recently updated of {total} repositories." |
| Left-out items | "{n} repositories couldn't be shown." Do not say why unless known. Private repositories are never mentioned by name. |

Never fill an unavailable field with a placeholder that looks like data (0, "None", "N/A" without an explanation).

### 5.10 Approved additions (consolidated)

- **Relative age.** "0 minutes ago", "1 minute ago", "{n} minutes ago", "1 hour ago", "{n} hours ago", "1 day ago", "{n} days ago". Months use the same pattern ("1 month ago", "{n} months ago"). Use the singular for 1.
- **UTC fallback.** When the visitor's time zone cannot be determined, dates and times are formatted in UTC and labelled "UTC".
- **Partial list.** "Some repositories couldn't be loaded." With a known total, add "Showing {n} of {total}." It never implies the whole account failed.
- **Counts.** "1 repository couldn't be shown", "{n} repositories couldn't be shown", "1 second", "{n} seconds".
- **Stale data.** A stale label appears only when the provenance says the data is a stale saved copy. No status is invented to fill a UI element.
- **Missing name.** Never render an empty heading or the word "undefined". Use a neutral fallback.
## 6. Do and don't examples

| Don't | Do |
|---|---|
| "This project is dead." | "Resting · last updated 2 years ago." |
| "The developer abandoned this repository." | "Last updated 2 years ago." |
| "Your build is broken." | "No workflow runs found." |
| "We fixed your repository." | "You marked this repository as revived in GRAVEREPO." |
| "0 open issues" (when the check failed) | "Open issues couldn't be checked." |
| "100 branches" (capped result) | "At least 100 branches" |
| "This project needs saving." | "This project could use a README." |
| "You're over the rate limit." | "GitHub allows more lookups at {time}." |

## 7. Checklist before shipping text

- Does it state a fact, or an interpretation? Is it labelled correctly?
- Does it claim a reason, intent or permanent state? Remove it.
- Is the source and time shown where it is known?
- Does it mean "unknown" where the data wasn't available?
- Does it suggest GRAVEREPO changed GitHub? Remove it.
- Is "revived" clearly local?
- Is it short, friendly and free of jargon?
- Does an error say what happened, when to retry, and offer the demo only when it is available?

## 8. Open decisions

- (Closed) Condition names and thresholds: approved, see 5.2.
- Whether "lookups" or "requests" is the final user-facing term for GitHub requests.
- (Closed) Plan item wording: approved as "Because {fact}, you could {step}." The step texts are in `resurrection-ritual` design 5.1.
