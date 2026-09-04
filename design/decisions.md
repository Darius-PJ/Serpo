# Design decisions: Serpo

Project path: C:\Users\darius.jones\Documents\job-tracker
Log path: C:\Users\darius.jones\Documents\job-tracker\design\decisions.md
Repository state at audit: 8384d8b
Modes: Product UI
Started: 2026-09-04
Delivered: 2026-09-04
Monet references as of: sources.md 2026-09-03, audit-checklist.md 2026-09-04, color.md 2026-09-04, form.md 2026-09-03, density.md 2026-09-03, typography-motion.md 2026-09-04, adoption.md 2026-09-03, brand.md 2026-09-04

## 1. Audit

## Audit: Serpo, 2026-09-04

Mode(s): Product UI
Auditor: Monet, against references as of the dates above. The running app at 127.0.0.1:3000 was walked with the owner's own database; no personal record from it is reproduced here.

### Styling system (UI-01)
Classification: Tailwind v4
Tokens: `app/globals.css`, a `:root` block of 15 custom properties mapped through `@theme inline`, plus five component classes (`btn-primary`, `btn-secondary`, `btn-danger`, `btn-danger-outline`, `card-soft`, `input-soft`, `chip`, `cloud-cell`) under `@layer components`
Component library: none; hand-written components under `components/`
Fonts: Nunito variable, self-hosted from `app/fonts/` through `next/font/local`, weight axis 200 to 1000, Arial fallback
Themes present: dark only ("Night Shift": Vesper violet ground with saffron and gold accents); no `color-scheme` and no `prefers-color-scheme` response
Native form Monet will emit in: `:root` and `@theme inline` tokens in `app/globals.css`, component classes in the same file, utility classes in `app/**/*.tsx` and `components/*.tsx`

### Scope boundary (Intact)
Presentation files, in scope: `app/globals.css`, `app/layout.tsx`, `app/fonts/`, `components/SideNav.tsx`, the markup and class attributes of `app/**/page.tsx`, `app/error.tsx`, `app/not-found.tsx`, and `components/*.tsx`, `public/` images
Logic files, out of scope and hashed: everything under `lib/`, `app/api/`, `prisma/`, `scripts/`, `tests/`, `instrumentation.ts`, `next.config.ts`, and every server action, handler, `fetch`, `prisma` call, form `action`, `onSubmit`, and state hook inside the component files. In a component file Monet changes class attributes, element structure, and copy; it does not change props, handlers, IDs, names, or data flow.
Hash manifest: to be written at step 4 as `design/invariants.sha256` over `lib/**`, `app/api/**`, `prisma/**`; component logic is checked by diff.

### First-time path and job map (UI-02)
Path: `/` redirects to `/dashboard` -> the first-time user either presses "Source jobs" (to `/sourcing`, a search form) or "New application" (an inline form on the dashboard) -> an application exists -> `/pipeline` shows it in a column -> first task complete: one application tracked, with the dashboard now showing it.
| Screen | Primary job | Secondary jobs | What it communicates now: what is this / what do I do / why trust it |
|---|---|---|---|
| Dashboard, empty (first run) | data-heavy dashboard | consumer utility (the two add forms) | "Dashboard" with a mascot portrait and the name Serpo; nothing says what Serpo is / three actions of near-equal weight (Source jobs, New application, Add a task) above a page of zeros and empty states / nothing on screen says the data stays on this machine, which is the product's strongest trust claim (README) |
| Sourcing | content consumption | consumer utility | "Search live sources, review boards, or ask the AI scout" / a search form with a job title and location, plus two side panels / a paragraph of caveats about relevance in 12-pixel muted text |
| New application (inline form) | consumer utility | none | Four labelled fields and Save / clear / it is a form |
| Pipeline | data-heavy dashboard | none | Kanban columns by status with source chips and a status select / drag or change status / an audit event on every change, invisible to the user |
| Work, Contacts, Resume, Settings | data-heavy dashboard, content consumption | none | Headed cards with empty-state sentences; Settings holds "Saved answers" and a Danger zone with "Wipe all my data" |

### Findings by item
UI-01: Tailwind v4 with a small, disciplined token set. 569 `className` uses, 0 inline style objects, 0 hex literals outside `globals.css`. The token names are semantic (`--primary`, `--accent`, `--danger`, `--surface`) and the component classes are used consistently. The palette is Hesperia-adjacent: `--background #33305e` is Vesper violet, `--accent #c9982e` is Apple-gold, `--foreground-muted #c9bba4` is Tufa dust, `--primary #dc7c36` is Flammeum saffron. Serpo has invented its own tints: `--primary-light #e89257`, `--primary-dark #f0a671`, `--danger-dark #f2ac9c`, `--accent-light #dcae45`, `--surface #3d3a6b`, `--surface-sunken #2b2850`, `--foreground #efe7d8`, `--border-soft #4a5580`. None of the tints is in the brand's tint scale, which the brand file says the brand owns (brand.md section 3).
UI-02: The path above. The first screen offers three ways to begin at similar weight, and the product's own plan says sourcing is "the daily action this workspace exists to prompt," while the readiness audit of 2026-08-08 says discovery is the least finished promise. For a first-time user the reliable first success is adding an application by hand.
UI-03: The first screen says "Dashboard." The name Serpo, a mascot portrait (Rokuro), and a gradient wordmark sit in the sidebar. Nothing states the category ("a job-search CRM that stays on your machine") anywhere in the UI; the README carries it. A first-time viewer who did not read the README sees a generic dashboard shell.
UI-04: Three candidates for the first action at near-equal standing: "Source jobs" (filled, top right), "New application" (outlined, top left), and an "Add a task" input with a date and an "Add task" button (filled, in the first section). Under an empty database the queue says "All caught up," the six pipeline chips read 0, the eight metric cards read 0 or 0 percent, and activity says "No activity yet." The first action is not obvious; the screen is a page of zeros. Crosses the threshold in C-density-021 (P) by the number of competing actions and C-density-020 (P) by the emptiness.
UI-05: Trust signals present: the app runs at 127.0.0.1, which a technical user notices in the address bar; the settings page names a wipe-everything action; focus rings and a skip link show care. Absent: any statement of the local-first promise, of what the AI does and does not do without a key, or of what "nothing sends without you" means, which are the product's three real trust claims (README) and are all true (PR-01 would pass them). C-adopt-004 (E, aged): a backed claim raises trusting belief, a bare one does not; here the claims are not even made.
UI-06: Dashboard density with data: an attention queue, a quick-add task row, a collapsed application form, six status chips, eight metric cards, a source table, and an activity list, in one column of at most 1,024 pixels. On a 1,280 by 900 viewport about a quarter of the width is empty and the pipeline board's columns are cramped inside the same 1,024-pixel limit, with their cards at 12 and 14 pixel type. Dosing: everything is on the first screen; the metrics section, which the plan calls Phase 6, sits above the activity feed for a user who may have three applications. The pipeline chips duplicate the board's column headings.
UI-07: Consistent: one card shape, one input shape, one chip, four button classes used as intended, one type family. Inconsistent: the mascot portrait and gradient wordmark are the only pictorial or gradient elements; the body carries two fixed radial gradients; buttons lift on hover with `transition-all` while the sidebar is the only element with a reduced-motion guard; the sourcing page uses a `cloud-cell` "puffy" shape that appears nowhere else. Type sizes: 113 uses of 12 pixels, 155 of 14, 1 of 16, 6 of 18, 11 of 20, 1 of 24. Almost all reading happens at 12 and 14 pixels on a dark ground (C-type-010, E, aged: the light-on-dark penalty grows as characters get smaller).
UI-08: Feature inventory below.
UI-09: Accessibility block below.
UI-10: Dark only, a committed "Night Shift" look with no system-setting response. C-color-033 (T): about a third of users set light and expect apps to follow the system. C-color-024 (E, active): dark mode raised cognitive load for older adults in bright rooms and for younger adults in dim rooms; the audience's evening use is the case where dark costs least for younger users. The brand file's condition on violet as a ground (section 3) is that a light theme is offered.
UI-11: Expectations block below.

### Accessibility (section 7)
Contrast, WCAG 2 then APCA, computed with `tools/contrast.py`. Body `#efe7d8` on ground `#33305e` 9.91 / 86.1 and on surface `#3d3a6b` 8.48 / 82.9: pass. Muted `#c9bba4` on ground 6.45 / 60.0 and on surface 5.52 / 56.9: pass WCAG 2 at any size; under APCA Lc 60 is content text at 24 px regular or 16 px bold, and it is used at 12 px regular in 113 places, which the advisory method rates below the floor for that size. Primary-dark `#f0a671` on ground 6.03 / 56.6: same standing, used for headings and links at 14 px. Button ink `#2a2748` on primary `#dc7c36` 4.71 / 42.4: passes WCAG 2; APCA rates it at the text floor for 14 px semibold, and the button gradient runs to `#e89257` where it is 5.86 / 51.4. Saffron `#dc7c36` on ground 4.05 / 38.7: passes non-text 3 to 1. Gold `#c9982e` on ground 4.65 / 44.3. Danger-dark `#f2ac9c` on ground 6.47 / 60.2. Border-soft `#4a5580` on ground 1.68 / 10.2 and on surface 1.44 / 0.0: fails 3 to 1 as a UI-component boundary (SC 1.4.11), and it is the only border on inputs and cards. White on danger `#b33f2e` 5.73 / 83.0: pass.
Motion: hover lift of 2 px on primary and danger buttons through `transition-all`; nine `transition-` uses in all; one `motion-reduce:transition-none`, on the sidebar width only. Nothing auto-plays, nothing flashes, nothing moves for more than five seconds. The reduced-motion gap is a policy gap (SC 2.3.3 is AAA; the hard rule counts motion sensitivity as a constraint), not a failure of the A or AA criteria.
Color-alone: status is always carried by a word (chips, badges, select), and kind badges carry text. 35 uses of semantic colour classes were found; none seen carrying meaning alone on the walked pages. One `aria-live` region in the codebase. To be re-checked on the application detail page at step 5.
Focus: a skip link to `#main-content`; `focus-visible` rings on every button and input class; `aria-current` on the active nav item; icon-only nav at narrow widths keeps `aria-label` and `title`. Order follows the DOM: sidebar, then page. Pass.
Targets: `btn-*` at `py-1.5 text-sm` are about 32 px tall; chips at `py-1 text-xs` about 26 px; nav items about 36 px; the pipeline status select is native. The smallest interactive target found is the chip at about 26 px, above the 24 px minimum (SC 2.5.8) and below the thumb sizes in C-form-019 for the mobile layout, where the sidebar collapses to icons at 4.25 rem.
Text: not tested at 200 percent or with text-spacing overrides in this audit; the layout is fluid and the type is in rem, so failure is unlikely but unverified.

### Feature inventory (the contract)
From the README, the navigation, and the walked pages. A redesign removes nothing here.
- Dashboard: needs-attention queue (tasks, apply runs, drafts, follow-ups due), quick-add task with date, stale-application review panel, new application inline form, pipeline status counts linking to the board, pipeline metrics (funnel counts, submission rate, interview rate, median stage age, weekly stage moves, source effectiveness table), recent activity feed, "Source jobs" link
- Sourcing: federated job search (title, location, remote-only, page size), job boards and resources panel with add-a-board, resource discovery ("Gather"), AI scout entry, result cells with save-to-pipeline
- Pipeline: kanban by status with drag-and-drop, status select per card, stage-aging and source chips, filter by company or role, source filter, "New application" and "Source jobs" links
- Applications: per-application record with details form, tasks, contacts, message drafts, apply panel, unified timeline
- Work queue: open tasks, outreach drafts, contact recency
- Contacts: company-grouped contacts with interaction log and add form
- Resume: template, per-application tailoring, touch-up, DOCX export
- Settings: saved answers for auto-apply, danger zone with wipe-all
- Global: sidebar navigation with collapse preference, skip link, mascot and wordmark, local-only binding, no login

### Expectations (T)
A job seeker who has used Huntr, Teal, Simplify, a Notion or Trello board, or a spreadsheet expects: a board of columns by stage, a list view, reminders for follow-ups, a place for contacts, and an import or browser-extension way to capture a posting. They expect a light theme by default with a dark option, and a first screen that either shows their board or asks them to add their first job. They expect a cloud product; a local app that keeps their data is unusual and, once understood, a reason to prefer it. These are Monet's expectations from memory; no tier 4 source was fetched.

### Provisional recommendations
- UI-04, UI-06: Give the empty first screen one obvious action. Under an empty database the dashboard should read as a beginning ("Add your first application, or search for one") with one filled button, and defer the metrics section until there is anything to count. Claims C-density-021 (P, nothing better exists), C-density-020 (P), P-007 (O, aged: one next step replaced a decision the user made on every open), P-004 (O, aged: one decision per screen for a stressed audience); transfer: job seekers are a stressed audience on a laptop, close to P-004's carers on mixed devices; provisional.
- UI-07, accessibility: Raise the type floor. Body at 16 px, secondary at 14 px, and nothing below 12 px; lighten `--foreground-muted` toward the brand's Tufa dust at a tint that clears Lc 75 for 14 px, or reserve it for 16 px and up. Claims C-type-010 (E, aged), C-color-023 (E, aged: the dark-on-light advantage grows as characters get smaller), C-type-021 (P), C-color-034 (P); transfer: measured on general adults reading on screens, which this audience is; provisional.
- UI-10: Offer a light theme following the system setting, with violet kept as ink, band, and focus ring on the light side. Claims C-color-033 (T, expectation only), C-color-024 (E, active), C-color-025 (E, active: preferred polarity is often not the best-performing one), and the brand file's condition on violet grounds; provisional.
- Accessibility: Bring `--border-soft` to at least 3 to 1 against ground and surface for inputs and interactive card edges, and check the button ink against the saffron gradient at size with real type (C-color-034). SC 1.4.11; provisional.
- UI-05: State the three true trust claims on the first screen and in Settings, in one line each: data stays in one file on this machine; the AI does nothing without your key; nothing is sent without your review. Claims C-adopt-004 (E, aged: backed claims raise trusting belief), C-adopt-001 (E, aged: real-world feel and trustworthiness signals), PR-01's rule that only true claims appear; transfer: measured on shoppers judging stores; the mechanism, a specific backed statement, is general; provisional.
- UI-01: Adopt the brand's tint rule: replace Serpo's own tints with tints derived from the palette by lightness alone and record them in the brand file's tint scale, so Serpo, Mag7, and Morgans stop deriving their own. Claims brand.md section 3, C-color-015 (P); provisional.
- UI-06: Let the board use the width. Widen `max-w-5xl` for the pipeline and sourcing pages so columns and result cells are not cramped inside 1,024 px on wider screens, keeping the reading pages narrow. Claims C-type-002 (review: measure in characters matters for reading, not for boards), C-density-015 (E, aged: formatting a dense display helped novices most); provisional.
- UI-07: Reduced-motion guard on every transition and lift, matching the sidebar's existing guard. C-type-016 (E: over a third of adults over forty have some vestibular dysfunction); provisional.
- UI-03, UI-07: Keep Serpo's own face. The Rokuro portrait and the name are Serpo's identity within the Hesperia family; the audit does not propose replacing them, only surrounding them with the category statement. No claim needed; provisional.

### Open questions for the audience step
- Who is the job seeker: you alone, or people who install Serpo from `Install-Serpo.cmd`? The installer and README suggest the second; the empty-state design assumes a stranger.
- Where and when is Serpo used: a laptop at home in the evening, a second monitor during the day, ever on a phone? The dark-only theme and the 1,024 px column both depend on the answer.
- Which first success matters more: an application entered by hand, or a search that finds one? The readiness audit says search is the less reliable path today.
- Is Rokuro (the mascot) part of Serpo's identity to keep, and does Serpo want to draw from the Hesperia palette by rule, as the brand file assumes, or keep its own saffron-first palette?

## 2. Audience statement

Approved by the user on: 2026-09-04, with amendments recorded here in the user's words.

Audience: A person in an active job search, applying to several roles a week, technical enough to run a local installer, who wants one place that holds every application, contact, and follow-up without handing the search to a cloud service. The owner was the original and is the "guinea pig"; opening Serpo to others has only just been considered. Because it started as a personal project, there is little to no explanation of how to engage with Serpo, and the redesign must supply it.
Their risk in trying the product: an evening spent setting up a tool that adds bookkeeping to an already draining search; something going out under their name that they did not check; and, mainly, that they never follow up in a way which makes them stand out.
The single emotion the product must produce: "I'm capable and secure in my job search, I'm applying myself fully to this task." Monet's short form: capable and secure.
Jobs on the first-time path: data-heavy dashboard (the home and the board), consumer utility (adding an application, a task, a contact), content consumption (sourcing results). The first success to optimise for is a successful search: a search that finds a role worth tracking. "That's where the future lies."
Device and setting: a laptop or a monitor, not mobile; at home, mostly evenings in a lit room. Ages roughly 22 to 55.
Palette: Serpo draws from the Hesperia palette by the brand file's rule. Rokuro and the name Serpo remain Serpo's own face.

## 3. Directions

Paragons and cautionary entries pulled by job. Data-heavy dashboard: P-011 (the boundary: dense is right only for experts who live in the tool, which a job seeker is not). Content consumption: P-006 (persistent navigation), P-007 (one obvious next step replaced a decision made on every open), P-009 (a personal reflection of one's own history, for the user alone). Consumer utility: P-012 (sameness as trust, the counterweight against change for its own sake). Cautionary: X-010 and X-011 (the feature inventory is a contract; do not remove the learned entry point), X-001 (do not move what habit finds, which constrains little here because the only habitual user is the owner), X-002 (do not take away the user's control over what appears first). Each was studied for mechanism and set aside; no paragon's look is reproduced.

Every direction carries the same system work, decided at step 4 whichever is chosen: a light theme following the system setting with violet kept as ink and band; a 16-pixel body floor and a 14-pixel secondary floor; borders and button ink brought to the contrast lines; the trust claims stated; Serpo's tints replaced by tints derived from the palette and recorded in the brand file; a reduced-motion guard on every transition; the board given the width. The directions differ in what the home screen is for a person who has just installed Serpo, and in how the first search is prompted.

### Direction A: Search is the front door
Intended audience reaction: "This is a job search. I type what I'm looking for and it goes to work."
Mechanism: For a new user the home screen is the search itself: one line that says what Serpo is, one search field (title, location, remote), and the pipeline board empty beneath it with its columns labelled, so the user sees where results will go before running the first search. Once the pipeline has applications, the same home shows the attention queue above the search and the board summary below. The dashboard's metrics and activity move to a second screen until there is a week of data. Sourcing keeps its own page for boards, resources, and the AI scout; the home carries only the one search.
Claims: P-007 (O, aged; habit product, mobile, 2022: one next step on opening, no measured harm at scale); C-density-021 (P, nothing better exists); C-adopt-019 (P, synthesis: what is this, what do I do, why trust it, in that order); C-density-014 (E, aged; new users of a word processor, creative tool, desktop, 1984: remove the ways to get lost rather than adding instructions); C-adopt-011 (E, aged; general, 2006: a task begun is not abandoned as readily; used only for real progress, the first search run).
Paragons studied for mechanism: P-007, P-004 (one decision per screen for a stressed audience), X-011 (the sidebar keeps every entry point; nothing is removed).
Transfer check: P-007's audience was learners on phones opening an app by habit; this audience opens a laptop app by intent, so the mechanism transfers as "no decision to make on arrival," not as habit. C-density-014 was measured on new users of a desktop tool, which this is. The owner's own daily use is the one habit at stake (X-001); the sidebar and every page keep their places, so the learned map survives.
What it costs: The returning user with follow-ups due sees the search before the queue until the queue has items, so the ordering must flip on data, which is a rendering condition on data the page already loads. The readiness audit says search is the least reliable path today, so this direction bets the first minute on the sources working; when a search returns nothing the empty result must say so plainly and offer "add one by hand," or the first minute fails. The dashboard's metrics lose their place on the first screen, which the owner, as the daily user, may miss (X-002 warns against removing control over what appears first; a link keeps it one click away).

### Direction B: Today, in order
Intended audience reaction: "It tells me what to do today, and the first thing is to find something worth applying to."
Mechanism: The home answers "what do I do today" as a short ordered list built from data the page already has: follow-ups due first, then applications waiting on a step, then "find more," which is the search form inline. On an empty database the list is one item: run your first search, with the search form open under it and a sentence explaining what happens to a result you keep. The board, metrics, and activity sit below under headings. The list is the attention queue the dashboard already renders, re-ordered so that follow-up, the risk the owner named, always comes first, and search is always present as the last item so the user never leaves the home to feed the pipeline.
Claims: C-adopt-019 (P); P-007 (O, aged); C-density-017 (O, aged; web users, content consumption, mixed, 2017: headings and front-loaded words change the scanning pattern); C-adopt-012 (E, aged; reward-program members, transactional trust, 2006: people work harder as they near a goal; used only as real remaining distance, never manufactured); C-density-016 (E, aged; general: hiding features without a path leaves them unused, so metrics and the full sourcing page stay one click away); C-form-018 (E, aged; general web users, consumer utility, desktop, 2017: strong signifiers on the one filled action).
Paragons studied for mechanism: P-007, P-006 (persistent access to the main links), P-009 (a reflection of the user's own progress, for the user alone: the "this week" line), X-002.
Transfer check: The attention queue exists; the direction changes its order and adds the search as a standing last item, which is markup over data already on the page. C-adopt-012 was measured on loyalty programs; the mechanism is used only to show real counts of follow-ups done and due, which is what the owner asked the product to make them good at. C-density-017 transfers directly to a list with headings.
What it costs: The home becomes a to-do list, and a to-do list with nothing on it must still feel like a beginning rather than a reproach; the empty state's copy carries that. The order is Monet's judgment of what a job seeker asks first, and it is fixed; a returning user cannot re-order it (X-002), so the section headings must make the fixed order feel obvious rather than imposed. Follow-up-first means a user who has never followed up sees that gap first, which is the point and also a small daily discomfort.

### Direction C: Guided rooms
Intended audience reaction: "Each screen tells me what it is for, and the first one shows me the three moves."
Mechanism: The dashboard keeps its present order and content, and every screen gains a one-paragraph explanation under its heading of what it is for and what to do there, written in Serpo's voice. On an empty database the dashboard shows a three-step guide above the queue (search, track, follow up) whose steps light up as the user does them, derived from counts the page already has (applications, follow-ups logged). The guide disappears when all three have happened. Search stays on its own page; the guide's first step links to it.
Claims: C-adopt-011 and C-adopt-012 (E, aged; real progress only); C-density-014 (E, aged); C-density-016 (E, aged); C-adopt-019 (P); P-012 (O, aged; sameness as trust: the owner's daily map does not move).
Paragons studied for mechanism: P-012, P-004 (plain language for an anxious audience), X-001 (nothing moves), X-010.
Transfer check: The guide's steps are real state, not an artificial head start, which is the condition C-adopt-011's transfer note sets. P-012's sameness protects the one habitual user, the owner. The explanations answer the owner's own note that there is no explanation of how to engage with Serpo.
What it costs: This is the smallest change to the home and so does least for the first minute: the page of zeros remains under the guide, and the first search still happens on another page, one click away, which C-density-021 counts as a level of depth. Explanatory paragraphs on every screen are the "adding instructions" that C-density-014 found weaker than removing the ways to get lost; they help the first week and become noise by the second, so each must be short and easy to ignore. It answers the owner's request for explanation most directly and the owner's stated first success least directly.

Selected: A, by the user on 2026-09-04, with C's one-line explanations folded in. Reason recorded: "Go with A, Search at the top. Include C's one-line explanations. I imagine instead of 'New application' it says 'Add manual application'; this signals that searched applications are the expected path."

## 4. Decisions

### D-001: Two themes from the palette, following the system setting
Mode: Product UI
Choice: `app/globals.css`. `:root` carries the light theme and `@media (prefers-color-scheme: dark)` the dark one; `color-scheme: light dark` on the root. Light: ground Spear-gleam `#E9EEF5`, surface white, sunken `#DDE3EC` (Spear-gleam at lightness 0.90), ink Vesper violet `#33305E`, muted Earth-shadow blue `#55668A`. Dark: ground Vesper violet, surface `#3E3B73` (violet at 0.34), sunken `#2C2951` (violet at 0.24), text Spear-gleam, muted `#DDD4C5` (Tufa dust at 0.82). Every tint is a palette hue moved in lightness only.
Intended effect on the user: Serpo looks like the rest of the user's machine, light or dark, and the violet ground is kept for those who chose dark; on the light side violet is ink, button, band, and focus ring, as the brand file commits.
Claims relied on: C-color-033 (T, expectation only: a third of users set light and expect apps to follow) ; C-color-024 (E, active; younger and older adults, general, 2023: dark mode raised load in bright rooms for older adults) ; C-color-025 (E, active; general, 2023: preferred polarity is often not the best-performing one, so the choice is left to the system rather than to a brand) ; brand file section 3, condition 2 ; `color.md` section 10 for every pair.
Transfer check: The audience reads on a laptop in a lit room in the evening, mixed ages 22 to 55; the polarity studies were on general adults on screens, which this is. The T claim is used only as an expectation, not as a reason.
Alternatives rejected: dark only, as shipped (fails the brand file's condition and the third of users on light); a light default with a manual toggle (a toggle is state, which Monet does not add; the system setting needs none).
Flagged claims argued: none.

### D-002: Role tokens recomputed so that every text pair and every border clears both contrast lines
Mode: Product UI
Choice: In the dark theme, primary fill Apple-gold light `#EAD4A4` with violet ink (8.38, Lc 74); accent text `--primary-dark` Apple-gold light, underlined as a link; icon accent Apple-gold `#C9982E` (4.65, Lc 44); danger fill Ember `#8E3A2C` with Spear-gleam text (6.45, Lc 79); danger text Ember light `#E4B2A9` (6.52, Lc 61); border `#908CC4` (violet at 0.66: 3.90 on ground, 3.24 on surface). In the light theme, primary fill violet with Spear-gleam ink (10.44, Lc 90); accent text violet, underlined; icon accent Cyprian copper `#B0703A` (4.02 on white); danger Ember with white text (7.52); border `#7C78BA` (violet at 0.60: 4.00 on white, 3.43 on Spear-gleam). Saffron `#DC7C36` and Serpo's own tints (`#e89257`, `#f0a671`, `#f2ac9c`, `#dcae45`, `#3d3a6b`, `#2b2850`, `#efe7d8`, `#4a5580`) are retired.
Intended effect on the user: Every line of text and every control edge is legible on its ground in both themes, and the one primary action is the only filled gold or violet element on a screen.
Claims relied on: `color.md` section 10 and the pairs computed for this project on 2026-09-04 with `tools/contrast.py` ; C-color-015 (P, nothing better exists: one accent carries the primary action) ; C-color-027 (E, active: gold-family text on a dark ground fatigues least) ; C-form-018 (E, aged; general web users, consumer utility, desktop, 2017: weak signifiers cost 22 percent more time, so borders must be visible) ; SC 1.4.3 and 1.4.11.
Transfer check: computed for these exact colours; C-form-018 was measured on desktop web users finding controls, which is this audience on this device.
Alternatives rejected: keeping saffron as the primary fill (its dark ink sits at Lc 42, below the fine-text line, and saffron on white is 3.01, so it cannot lead in the light theme); Tufa dust unchanged as muted text (Lc 60 at 14 px is below the advisory line; the 0.82 tint clears Lc 74); violet-family borders at lightness 0.45 to 0.55 (all under 3 to 1 on violet).
Flagged claims argued: none.
Proposed addition to `brand/brand.md` section 3, "Tints", for the owner, not applied: Vesper violet surface `#3E3B73` (L 0.34) and sunken `#2C2951` (L 0.24); Spear-gleam sunken `#DDE3EC` (L 0.90); Tufa dust light `#DDD4C5` (L 0.82); Apple-gold lighter `#F2E3C1` (L 0.85); Ember hover `#A3463A` (L 0.43) and deep `#7A3226` (L 0.32); violet border light `#908CC4` (L 0.66) and border dark-theme `#7C78BA` (L 0.60). All derived by lightness only.

### D-003: The type floor: 16-pixel body, 14-pixel secondary, 24-pixel page titles
Mode: Product UI
Choice: `html { font-size: 16px }`; across every page and component, `text-sm` became `text-base` and `text-xs` became `text-sm`; page titles `text-xl` became `text-2xl`; section headings are 18 px bold in the foreground colour instead of 14 px bold in the accent. Nothing renders under 14 px.
Intended effect on the user: An evening's reading on a dark ground without leaning in; the hierarchy carried by size and weight rather than by accent colour.
Claims relied on: C-type-010 (E, aged; general, on screen: the light-on-dark penalty grows as characters get smaller) ; C-color-023 (E, aged) ; C-type-001 (E, aged; 104 adults reading a text-heavy site, desktop, 2016: readability rose with every step from 10 to 26 points) ; C-type-021 (P, synthesis) ; C-type-022 (E, active; 60 adults, 2025: print size drives reading speed at every size).
Transfer check: All measured on adults reading on desktop screens, which is this audience on this device. C-type-001 was continuous reading; Serpo is scanning and short reading, where the penalty for small type is the same direction and smaller.
Alternatives rejected: a two-step lift only for body text (leaves 113 labels at 12 px on violet); 18 px body (the board and the search results become taller than the audience's evening scan wants; C-type-001's best comprehension at 18 was for articles).
Flagged claims argued: none.

### D-004: Search is the front door of the dashboard, and the manual path is named as the exception
Mode: Product UI
Choice: `app/dashboard/page.tsx`. One line under the title says what Serpo is. With nothing waiting on the user, the search section leads ("Start with a search" until anything is tracked, then "Find the next one"), with the existing `JobSearchForm` rendered inline; beneath it, "Found a role somewhere else?" and the manual form whose button now reads "Add manual application." When the attention queue has items, the queue rises above the search. Pipeline counts follow; metrics and activity render only once something is tracked; the sourcing page is reached by a secondary "Boards and AI scout" button. Every data call on the page is unchanged; the sections are re-ordered and conditioned on counts the page already loaded.
Intended effect on the user: On first open there is one thing to do and it is the thing the product exists for; on return, what needs attention comes first and the search is one scroll away rather than one page away.
Claims relied on: P-007 (O, aged; one obvious next step on opening, no measured harm at scale) ; C-density-021 (P, nothing better exists) ; C-density-020 (P) ; C-adopt-019 (P, synthesis) ; C-density-014 (E, aged; new users, desktop, 1984: remove the ways to get lost) ; C-density-016 (E, aged: hidden features need a path, so boards, the scout, metrics, and activity stay one click or one scroll away) ; X-002 (O, aged: control over what appears first is kept by the ordering rule, which follows the user's own data).
Transfer check: P-007's audience opened a phone app by habit; this audience opens a laptop app by intent, so only "no decision on arrival" transfers. C-density-014 was measured on new users of a desktop tool. The owner's habit (X-001) is protected: every page keeps its place in the sidebar and nothing was removed.
Alternatives rejected: directions B and C, for the costs in section 3; hiding metrics behind a disclosure control (that would add state); moving metrics to a new route (that would copy data calls into a second page, which is logic).
Flagged claims argued: none.

### D-005: One-line explanations under every page title, and the three trust claims stated
Mode: Product UI
Choice: A `page-lede` class (16 px, muted, one measure wide) under the title of the dashboard, sourcing, pipeline, work queue, contacts, and settings, each one sentence saying what the page is for and what to do there. The dashboard's footer and the settings lede state the three claims from the README: everything is stored in one file on this computer; AI features run only with a key you add; nothing is sent to anyone without your review. The empty search result now says what happened and offers the manual path.
Intended effect on the user: A stranger who never read the README knows what each room is for, and the product's real reasons to be trusted are on the screen rather than in a repository file.
Claims relied on: C-adopt-004 (E, aged; 112 lab participants, transactional trust, desktop, 2006: a backed claim raised trusting belief, a bare one did not) ; C-adopt-001 (E, aged: real-world feel and trustworthiness signals) ; C-density-017 (O, aged: headings and front-loaded words change scanning) ; PR-01's rule that only true claims appear; each claim was checked against the README and the code paths it describes (local SQLite, opt-in keys, draft-and-review outreach).
Transfer check: C-adopt-004 was measured on shoppers judging a store; the mechanism, a specific statement backed by something checkable, is general, and here each claim is checkable in Settings and in the address bar.
Alternatives rejected: a first-run guide panel (direction C; it would need dismiss state); explanations in tooltips (hidden, and C-density-016 says hidden help is not used).
Flagged claims argued: none.

### D-006: Components calmed: flat fills, one card, visible edges, 40-pixel controls, motion opt-out
Mode: Product UI
Choice: `globals.css` component classes. Buttons are flat fills with a colour change on hover and no lift; every button and input has a 40 px minimum height; chips 32 px; one card shape (`card-soft`) with a visible border and no blur or glow, and `cloud-cell` now resolves to the same card; links in the accent colour are underlined (`link-accent`); the sidebar wordmark is one ink rather than a gradient; the body's fixed radial gradients are gone; a `prefers-reduced-motion` rule shortens every transition and animation to nothing.
Intended effect on the user: Controls read as controls at a glance, the one primary action is found by colour alone, nothing shifts under the pointer, and the surface is quiet enough that the content is the thing that moves.
Claims relied on: C-form-018 (E, aged: strong signifiers) ; C-form-019 (E, aged; one-handed touch, but the 40 px height also clears the 24 px minimum of SC 2.5.8 with margin for a laptop trackpad) ; C-type-016 (E; over a third of adults over forty have some vestibular dysfunction) ; C-color-015 (P) ; C-form-005 (E, aged: rounded corners keep the soft, comfortable signal, kept at a smaller radius).
Transfer check: The signifier study was desktop web users finding controls; the target claim was measured on phones and is used here only as a floor; the vestibular figure is a population statistic.
Alternatives rejected: keeping the hover lift with a reduced-motion guard only (the lift added nothing the colour change does not); pill-shaped buttons (kept as chips only, where the shape says "filter" rather than "act"); the radial background gradients in both themes (decorative, and on the light theme they read as stains).
Flagged claims argued: none.

### D-007: The content column widens to 1,152 pixels
Mode: Product UI
Choice: `app/layout.tsx`, `max-w-5xl` to `max-w-6xl`; reading text caps itself at `max-w-prose`.
Intended effect on the user: The pipeline board and search results use a laptop screen's width; paragraphs stay at a readable measure.
Claims relied on: C-type-002 (review: measure in characters matters for reading, not for boards) ; C-density-015 (E, aged: formatting a dense display helped novices most).
Transfer check: direct.
Alternatives rejected: full width (the dashboard's single column would sprawl); per-page widths (the layout is one file, and the prose cap does the same job with less).
Flagged claims argued: none.

## 5. Verification

Walked on: 2026-09-04, on the owner's running dev server at 127.0.0.1:3000 (the fixed code with these edits hot-reloaded), at 1,280 by 900, in both colour schemes, with the owner's own database. No personal record is reproduced here. `npx tsc --noEmit` passes; `npm run lint` passes; `npm run test:unit` passes 282 of 282; `sha256sum -c design/invariants.sha256` reports every logic file unchanged (122 files under `lib/`, `app/api/`, `prisma/`).

| Screen | What is this | What do I do | Why should I trust it | Accessibility findings |
|---|---|---|---|---|
| Dashboard, returning user (light and dark) | "Serpo keeps your job search on this computer: search for roles, track every application, and follow up on time." | With nothing waiting: the search field under "Find the next one," one filled Search button; "Add manual application" as the named exception below. | The footer's three claims; the address bar; the settings page repeats them. | Body 16 px Spear-gleam on violet 10.44 / Lc 90 (dark), violet on Spear-gleam 10.44 / 87 (light); muted 8.29 / 74 (dark), 4.93 / 68 on the light ground and 5.75 / 79 on white cards; primary button 8.38 / 74 (dark), 10.44 / 90 (light); borders 3.90 and 3.24 (dark), 4.00 and 3.43 (light). Focus rings on every control. Smallest target 32 px (chips); buttons 40 px. |
| Dashboard, first run (empty database, by the page's own conditions, read from the code and from the "all caught up" state on the live data) | Same line. | "Start with a search" leads; pipeline counts read 0 with a sentence saying what will appear there; metrics and activity are absent until something is tracked. | Same. | Same. |
| Pipeline | One line: every application by stage; drag or change status; each move is kept in the timeline. | Drag a card, or use the status select. "Search for roles" returns to the dashboard's search. | The timeline note. | Cards 16 px; column headings 16 px bold; drag handles keep their `aria-label`s. A hydration warning from dnd-kit's `aria-describedby` counter appears in the dev overlay; it predates these edits and is in the board's logic, which was not touched. |
| Sourcing | "Job boards, saved resources, and the AI scout. The quick search also lives on the dashboard." | Search here too, or manage boards. | Unchanged. | Result cells are the standard card; the 12 px caveat paragraph is now 14 px. |
| Settings | "Everything Serpo knows is in one file on this computer..." | Review saved answers; the danger zone is an outlined Ember button. | The lede is the trust statement. | Ember text 6.52 / 61 (dark), 7.52 / 85 (light). |

Feature inventory check: every line of section 1's inventory is present. Dashboard: attention queue, quick-add task, stale review panel, manual application form (renamed), pipeline counts, metrics, source table, activity feed, and the path to sourcing all present; the search form is added, not moved, since `/sourcing` still renders it. Sourcing, Pipeline, Applications, Work, Contacts, Resume, Settings, and the global elements are unchanged in function. Nothing removed.
Scope boundary check: the manifest passes; the diff touches `app/globals.css`, `app/layout.tsx`, `app/dashboard/page.tsx`, the page files, and 21 component files, and in the component files only class attributes, element order, and copy; no handler, prop, ID, name, `fetch`, or state hook changed (checked by reading the diff).
Accessibility sub-checklist: Contrast, every pair above, both methods, both themes; the weakest delivered pair is the light theme's muted text on the Spear-gleam ground at 4.93 / Lc 68, which passes 4.5 and the Lc 60 content line at 16 px. Motion: the hover lift is gone; a reduced-motion rule covers every transition. Color-alone: links underlined; status and kind carried by words; danger by an outlined button with a label. Focus: unchanged, rings on all controls, skip link kept. Targets: 40 px buttons and inputs, 32 px chips, 36 px nav items. Text: not tested at 200 percent; the type is in rem and the layout fluid.
Palette contrast: recorded in D-002 and the table above.
Limits: the first-run state was verified by reading the render conditions and the live "all caught up" state, not against an empty database; the search was not run against live sources; a phone layout was not walked, since the audience is laptop only.

## 6. Rubric

| Criterion | Monet | User | Note |
|---|---|---|---|
| Justified | pass | | Seven decisions, each with claims by ID, grade, and context, a transfer check, and alternatives; P claims marked; the one T claim used only as an expectation. |
| On brand | pass | | Every colour is a palette entry or a lightness-only tint of one; violet as ink, button, band, and focus ring on the light side; gold family leads on violet; brand file not edited; the tints are proposed to the owner in D-002. |
| Distinct | pass | | The category default (a light kanban tracker) is named in the expectations block; Serpo departs from it in the search-first home, the violet dark theme, and Rokuro, and matches it deliberately in the board. No paragon's look reproduced. |
| Intact | pass | | Manifest passes; unit tests pass; every inventory line present; the diff is class attributes, order, and copy. |
| Complete | pass | | Every screen of the first-time path walked in both themes with both contrast numbers; sub-checklist recorded; limits stated. |

Scored by the user on: 

## 7. Outcomes

| Date | Signal | Source | Decisions touched | Verdict per decision | Note |
|---|---|---|---|---|---|
| 2026-09-04 | In the dark theme the section headings ("Find the next one", "Needs attention", "Pipeline") did not stand out from body text; the owner asked for an accent colour. | Owner, reviewing screenshots of the delivered redesign before commit. | D-003 (hierarchy by size and weight alone) | Amended | A `--heading` token: violet ink in the light theme (no visible change), Apple-gold `#c9982e` in the dark theme, applied to every h1-h3 through `text-heading`. 4.65 to 1 on violet passes WCAG 2 AA at every size; under APCA Lc 44 is the large-text line, which the 24 px titles meet and the 18 px bold section headings sit just under. The owner's daily use is in the dark theme; the trade was made knowingly. |

Claims affected: 
