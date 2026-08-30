# CRM Dashboard Plan

**Date:** 2026-08-30
**Status:** Approved design; implementation not started.
**Goal:** Evolve the app from a job list with tools attached into a CRM for one job seeker: the home screen answers "what needs my attention today?", and every entity — application, contact, task, message — hangs off the pipeline.

The app stays local and privacy-minded. Every dependency below is a vendored npm/pip package; nothing calls an external service at runtime beyond the existing job-source adapters.

## Current State and Gaps

The schema already holds most CRM raw material: pipeline statuses, `DecisionMaker`, `Message` drafts, `AuditEvent`, stale/follow-up signals, and a sourcing stack with dedup fingerprints. The UI does not yet use it as a CRM.

| CRM capability | Current state |
|---|---|
| Deal pipeline (kanban, drag, stage aging) | Static columns in `app/dashboard/page.tsx`; `StatusSelect` dropdown only |
| "What needs my attention today?" | Scattered: stale panel, follow-up badges, apply-run states buried in detail pages |
| Contacts and relationship history | `DecisionMaker` is per-application discovery output; no reuse, no interaction log |
| Tasks / next actions | Only derived 7-day and 3-month signals; nothing user-creatable |
| Activity timeline per application | `AuditEvent` exists but is never rendered |
| Funnel metrics | None; status transitions are not recorded |
| Sourcing → pipeline funnel | Disconnected: search results and Raekwon leads have no triage step |

## Approach

**Chosen: derive-first, schema-later.** Ship the dashboard and pipeline board entirely from existing data (zero migrations), then add new models only when a phase requires them. The first phase delivers visible value, and the UI proves what the data model needs before we commit to it.

Rejected:

- **Data-model-first** — building `Task`/`Contact`/`Interaction` up front means weeks of migrations before anything visible, and risks modeling entities the UI turns out not to need.
- **UI facelift only** — kanban and metrics on the existing schema caps out at cosmetics: no next actions, no relationship tracking.

## Phase 0 (prerequisite) — Repair JobSpy

An audit on 2026-08-30 found the JobSpy adapter has never returned a listing. Root causes, in the order they bite:

1. **`python-jobspy` is not installed.** Every spawn of `scripts/jobspy_search.py` exits 1 immediately. The adapter fails on every search, and after three failures the circuit breaker suppresses it for 60s windows.
2. **Invalid JSON after installation.** The script serializes pandas records with `json.dumps(..., default=str)`, which emits bare `NaN` for missing values — `default=str` never sees them. Node's `JSON.parse` rejects `NaN`, so installation alone moves the failure from "exit 1" to "parse-error".
3. **The Google site returns nothing.** python-jobspy's Google scraper requires a `google_search_term` argument the script never passes, so the site the script's own comment calls "the single highest-leverage addition" contributes zero results.
4. **The adapter misreports readiness.** `isConfigured()` returns `true` unconditionally while the real dependency (the Python package) goes unverified, so the failure surfaces per-search instead of excluding the adapter as unconfigured.

Work items: install `python-jobspy` (`python -m pip install python-jobspy`), sanitize `NaN` to `null` in the script, pass `google_search_term`, probe the Python dependency so a missing package reads as *unconfigured*, and update the script's stale docstring (it still references the removed `lib/jobSources/jobSpy.ts`). Phase 7 assumes this phase is done.

## Phase 1 — Attention-first dashboard home

*No schema change.* Rebuild `/dashboard` as a CRM home with three regions:

- **Needs-attention queue** merging follow-ups due (`listFollowUpDue`), stale applications (`listStaleApplications`), apply runs in `needs_input`/`review_required`/`blocked`/`failed`, and message drafts awaiting approval.
- **Pipeline summary strip** — per-status counts linking to the board.
- **Recent activity feed** from `AuditEvent` (already indexed `[userId, createdAt]`).

The current column board moves to `/pipeline`.

## Phase 2 — Real pipeline board

Drag-and-drop kanban at `/pipeline` using dnd-kit, stage-aging badges from `lastStatusChangeAt`, and source/keyword filters. Every status change writes a `status_changed` `AuditEvent` — the record Phase 6 metrics depend on. `StatusSelect` remains as the keyboard- and mobile-accessible path.

## Phase 3 — Tasks and next actions

New `Task` model: `userId`, optional `applicationId`, `title`, `dueAt`, `completedAt`, `snoozedUntil`. User-created tasks join the derived system signals in the attention queue, and each pipeline card can show its next action. System signals stay derived — only user intent gets persisted.

## Phase 4 — Contacts as first-class records

Promote `DecisionMaker` to `Contact`: user-scoped, company-grouped, reusable across applications, provenance fields kept. Add an `Interaction` log (email/call/LinkedIn/meeting/note, direction, `occurredAt`). A migration maps existing rows. New `/contacts` page; `Message` gains an optional `contactId`.

## Phase 5 — Unified application timeline

The application detail page gets one chronological timeline merging status changes, apply runs, messages, interactions, and completed tasks. Pure read-model — no schema. Can ship before Phase 4 in reduced form.

## Phase 6 — Metrics

Funnel conversion (Sourced → Submitted → Interviewing → Offer), response rate, applications per week, median time-in-stage, and source effectiveness — which adapter or board actually yields interviews. Computed from Phase 2's transition events; depends on Phase 2 and nothing else.

## Phase 7 — Sourcing funnel

Close the loop between sourcing and the pipeline:

- A triage inbox where search results and Raekwon leads land as shortlisted before becoming tracked applications.
- "Already tracked" badges in search results via the existing `JobListingFingerprint` dedup.
- Saved searches with a "new since last run" count on the existing `JobSourceCache` infrastructure.

## Dependencies

### Core additions (four small MIT packages)

| Need | Package | Why |
|---|---|---|
| Kanban drag-drop (Phase 2) | **dnd-kit** | Headless and maintained, with keyboard sensors and screen-reader announcements that match the app's accessibility posture. Alternative: Atlassian's pragmatic-drag-and-drop, faster for huge boards but lower-level. |
| Command palette | **cmdk** | ⌘K quick-find UI over the FTS5 index below. |
| Metrics charts (Phase 6) | **Recharts** | Reliable funnel/velocity charts. Tremor offers Tailwind-native dashboard blocks; uPlot if bundle size ever matters. |
| Date math (Phase 3) | **date-fns** | Tree-shakeable; replaces hand-rolled millisecond arithmetic as due/snooze logic grows. |

### Already shipped, just unused

- **SQLite FTS5** — compiled into `better-sqlite3`. A virtual table over company/role/notes/contact names gives instant global search with zero new dependencies.
- **React 19 `useOptimistic`** — keeps a dragged card in place while the server action persists the move; no client cache library needed for a single-user local app.

### Privacy-aligned options

- **Ollama** — local-inference backend behind the existing Anthropic client boundary, so drafting can run with zero egress. The default-deny egress proxy already provides the seam.
- **rss-parser** — many government and company boards expose RSS/Atom; polling a feed for Phase 7 saved searches is cheaper and more ToS-friendly than scraping, and fits the adapter interface as a `sourceKind`.
- **imapflow** — *strictly opt-in*: local IMAP ingest to auto-log recruiter replies as Interactions. Mailbox access; credentials stay local.

### Projects to study, not vendor

AGPL-family — read for patterns, copy no code:

- **Twenty** (twentyhq/twenty) — modern CRM interaction design: pipeline views, activity timelines, inline editing.
- **Monica** (monicahq/monica) — personal-CRM reminder semantics ("last contacted", "stay in touch every N days") that map onto follow-up hygiene.

**Reactive Resume** (MIT — borrowing allowed) — mature resume builder relevant to the Resume tab's structured editing and export.

### Deliberate exclusions

- **TanStack Query / SWR** — server components, actions, and `useOptimistic` cover a single-user local app.
- **shadcn/ui wholesale** — the app has a working design system (`card-soft`, `btn-primary`); cherry-pick a Radix primitive when a specific widget needs one.
- **A search-engine dependency** (minisearch, Orama) — FTS5 makes them redundant.
- **New scrapers** — JobSpy plus the Greenhouse/Lever token pattern, RSS, and the existing simhash dedup cover sourcing; the OSS scraper ecosystem beyond JobSpy is thin and stale.

## Decision Points

Flagged, not decided:

1. **A `Shortlisted` pipeline stage (Phase 7)** — growing the status enum touches `lib/applicationStatus` and every board column; the alternative is a separate triage inbox that never enters the pipeline.
2. **Contact-merge aggressiveness (Phase 4)** — how the migration treats the same person discovered on two applications: auto-merge on name+company, or keep duplicates and offer a manual merge.

## Cross-Cutting Constraints

- Local and privacy-minded throughout: no new external services, no telemetry, fonts and assets self-hosted.
- Hand-written SQL migrations, per repo convention.
- Unit and e2e tests per phase behind the existing CI gate (`npm run verify`).

## Sequencing

Phases are independently shippable. Hard edges: Phase 6 needs Phase 2's transition events; Phase 7 needs Phase 0. Phase 5 can move earlier in reduced form. Everything else is linear by value: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.
