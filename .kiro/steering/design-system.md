# GRAVEREPO design system

This document sets the visual and interaction direction for every GRAVEREPO screen. It stays small on purpose. Wording rules are in `voice-and-honesty.md`. Schedule and priorities are in `docs/roadmap.md`.

Items marked **(Open)** are not decided yet. Do not invent a value for them in code. Ask, then record the answer here.

## 1. Product identity

| Item | Value |
|---|---|
| Name | GRAVEREPO (written in capitals) |
| Tagline | "Dig up your forgotten code." |
| Theme | A whimsical spooky graveyard that gradually transforms into a living garden |
| Personality | Friendly, playful, mysterious, polished, approachable |
| Never | Genuinely frightening, gory, childish or mocking |

The graveyard is atmosphere. The person using the app is a developer looking at their own or someone else's work, so the interface treats every repository with respect (see `voice-and-honesty.md`).

## 2. Priorities

1. **Usability beats decoration.** If a decorative element hurts readability, contrast, focus visibility or performance, remove the decoration.
2. **The Resurrection Ritual is the main experience.** Necropsy → Plan → Rising → The Living. Design effort goes here first.
3. **Decoration starts simple** (roadmap rule): static SVG mascots and decorative elements first. Animation is added only after the core journey works, and every animation needs a reduced-motion version.
4. **The garden grows with progress.** The shift from graveyard to garden is the visual story. It follows real ritual progress and never plays on its own.

## 3. Visual direction

### 3.1 Colour roles

Use roles, not raw colours, in components. Exact values are kept in one place, the theme tokens file, once chosen.

| Role | Direction | Used for |
|---|---|---|
| Background | Deep navy | Page and large surfaces |
| Surface | Slightly lighter navy or purple | Cards, tombstones, panels |
| Primary / brand | Purple | Brand moments, primary actions, selected states |
| Accent: lavender | Soft lavender | Links, secondary highlights, focus ring candidates |
| Accent: mint | Mint green | Progress, growth, success, The Living |
| Accent: pumpkin | Pumpkin orange | Attention, warnings, notable findings |
| Text | Near-white on dark | Body and headings |
| Text muted | Lower-contrast light | Secondary text, only where contrast still passes |

Rules:
- Dark theme only for the MVP.
- Mint means growth and success, pumpkin means attention, and neither means "good" or "bad" about a developer.
- Do not add more accent colours. Do not use red as a decorative colour. If an error colour is needed, define it as a role and pair it with an icon and text.
- **Final values (chosen 23 Nov 2026, recorded with their ratios in `src/styles/tokens.css`):** bg #0f1224, surface #1b1f3b, text #f2f3fa (16.76:1 on bg), muted #b9bdd8 (8.68:1 on surface), primary #5b3fc4 with white text (7.11:1), lavender #c3b5ff (8.71:1 on surface), mint #7be3b0 (10.31:1), pumpkin #ffa94d (8.45:1), error #ff9e9e (8.15:1), border #8d93c4 (5.44:1 on surface). All meet 4.5:1 for text and 3:1 for controls.

### 3.2 Motifs

Allowed: ghost mascots, tombstones, bats, mushrooms, moss, cracks, cobwebs.

- Ghosts are the friendly guides. Keep them simple, rounded and expressive.
- Tombstones are the main repository component (section 5.1).
- Moss, mushrooms and sprouts show progress during the Rising and fill The Living.
- Cracks and cobwebs are light texture on resting tombstones. Keep them away from text.
- Bats are accents only, not a repeated pattern.
- Decorative graphics are hidden from assistive technology. Mascots that carry meaning get a text alternative.
- Do not use the mascot as the only way to deliver an important message.

### 3.3 Typography

- Clear, highly legible sans-serif for all body text, labels, numbers and data.
- One optional display style for the logo and main headings only. It must stay legible at small sizes and must never be used for body text or data.
- Prefer a system font stack or a self-hosted font. No third-party font requests at runtime, so the app still works offline (the demo must work offline, requirement 8.15 of `github-data-layer`).
- Body text at least 16px. Line length about 45–80 characters. Line height comfortable for reading.
- Hierarchy: page title, section heading, card title, body, caption. Four or five steps are enough. Use size and weight, not colour, to show hierarchy.
- Typeface: the system font stack (decided 23 Nov 2026). No remote fonts.

### 3.4 Spacing and layout

- One spacing scale based on 4px steps (4, 8, 12, 16, 24, 32, 48, 64). Use only these values.
- One corner radius family: small for controls, medium for cards and tombstones.
- Content first. Decorative elements sit in margins and backgrounds, and do not push content around.
- Responsive from small phones to wide desktops. Nothing may need horizontal scrolling at 320px width.
- Touch targets at least 44×44px.

## 4. Interaction principles

### 4.1 Motion

- Animation is subtle and purposeful. It explains a change (a tombstone opening, a sprout growing, a repository joining The Living) and is never decoration alone.
- Short durations. No looping animation near text. No flashing.
- Respect `prefers-reduced-motion: reduce`. Replace movement with an instant change or a simple fade, and replace looping effects with a static image. The same information must still appear.
- Provide this at the design stage for each animation, not afterwards.

### 4.2 Keyboard and focus

- Everything usable with a mouse is usable with a keyboard, including the whole Resurrection Ritual.
- A visible focus indicator on every interactive element, with at least 3:1 contrast against its surroundings. Never remove outlines without a replacement.
- Logical tab order that follows reading order. No keyboard traps. Dialogs trap focus only while open and return focus when closed.
- Do not rely on hover alone. Anything shown on hover is also available on focus and by tap.
- Provide a "skip to content" link.

### 4.3 States

Every screen or component that loads or changes data defines all of these states. Wording comes from `voice-and-honesty.md`.

| State | Requirement |
|---|---|
| Loading | Shows that something is happening and what. Keeps layout stable. Uses a simple indicator, with a static version under reduced motion. Announced politely to screen readers. |
| Empty | Says what is missing and offers the next step. |
| Error | Says what happened, whether it can be retried, and when. Offers the demo when the error allows it (`demoAvailable`). Uses an icon and text, never colour alone. |
| Partial / warning | Shows usable data together with a plain note about what is missing (for example a truncated or partial list, or sections that could not be checked). |
| Success | Confirms what happened without blocking the user. |

Rules:
- Errors and status changes are announced to assistive technology without moving focus unexpectedly.
- Show data freshness and source (live, saved copy, demo) wherever data appears. Use the labels in `github-data-layer/design.md` section 6.
- Demo data is always labelled as demo and is never shown as the result of a searched username.

### 4.4 Performance

- No large background videos or heavy effects. Prefer SVG and CSS.
- Decorative effects must not block the main thread or delay interaction.
- Lists of up to 300 repositories (the repository cap) must stay responsive. Keep per-tombstone decoration light.

## 5. Components

Reuse these. Do not add a new component when one of these can be adjusted.

### 5.1 Tombstone (repository card)

- Shows the repository name, a short description if available, and the status.
- **Status is always communicated by at least two methods: a text label, and an icon or shape.** Colour or texture may add a third cue but is optional. Colour is never the only signal, and never one of the two required methods.
- Status labels use the terms from `voice-and-honesty.md` (for example "Resting", "Archived", "Last updated 14 months ago"). Condition names and thresholds come from the `resurrection-ritual` spec.
- Archived, fork and empty repositories show a distinct icon plus text.
- The whole tombstone is one keyboard-focusable control, with a clear accessible name that includes name and status.
- Unknown data is shown as unknown ("Not available"), never as zero or blank.

### 5.2 Ritual stage indicator

- Shows the four stages (Necropsy, Plan, Rising, The Living) and the current one, using text and a shape, not colour alone.
- Reachable and operable by keyboard. The current stage is exposed to assistive technology.

### 5.3 Finding / evidence row (Necropsy)

- A plain label and the observed fact. Source and time (provenance) are shown for the repository detail as a whole, because the data layer attaches one provenance per detail, not one per finding. Interpretation, if shown, is visually and textually separate from the fact (see voice document).

### 5.4 Task checklist (Plan)

- Standard checkbox semantics with visible labels. Progress is saved by the ritual spec, so the state must survive reload.

### 5.5 Rising progress

- A progress indicator with a numeric or text value (for example "3 of 5 steps"), not graphics alone. The garden grows in steps that match real progress.

### 5.6 The Living

- A garden view of repositories whose local ritual is complete. Each has a text list equivalent that works without the visual garden.

### 5.7 Buttons, links and form fields

- One primary action per view. Secondary and tertiary actions are visually quieter.
- Visible labels on all fields. Error text sits next to the field and is linked to it.
- Links look like links. Buttons look like buttons.

### 5.8 Messages (notice / banner)

- One component with variants: info, warning, error, success. Each has an icon and a text label as well as colour.

### 5.9 Data source badge

- A small label for live, saved copy or demo, with the time. Used on lists and details.

## 6. Accessibility expectations

The target is WCAG 2.2 AA for the core journey. Specific checks before the checkpoint (roadmap check 6):

- Complete the ritual with the keyboard only.
- Reduced motion is respected everywhere.
- Contrast meets the ratios in section 3.1.
- Status is never colour alone.
- Headings, landmarks, labels and alt text are present and correct.
- Page zoom to 200% and text resize work without loss of content.
- Screen reader announcements for loading, errors and progress.

**Lantern Mode** is a separate specification (`lantern-mode`, to write). This document does not define it. The keyboard, contrast and reduced-motion requirements in this document already apply to the normal interface and do not wait for Lantern Mode. Lantern Mode may add to them but may not lower them.

## 7. Do and don't

| Do | Don't |
|---|---|
| Keep decoration behind or beside content | Put text over busy artwork |
| Use text, icon and shape together for status | Use only a colour change |
| Use short, purposeful motion with a reduced-motion version | Loop animation, flash, or auto-play effects |
| Reuse components in section 5 | Add one-off styles |
| Show unknown as unknown | Show missing data as 0 or blank |
| Show where data came from | Hide demo or cached labels |
| Keep the mood playful and warm | Use gore, jump scares or mocking imagery |

## 8. Open decisions

- (Closed) Final colour values and checked contrast ratios: see 3.1.
- (Closed) Typeface: system font stack.
- Mascot design and number of mascot poses.
- Whether the display style is used beyond the logo and main headings.
- Icon set.
- How `lantern-mode` differs visually (to be decided in its spec).
