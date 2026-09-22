# Product readiness audit — 2026-08-08

> **JobSpy follow-up (2026-09-21):** this audit remains a record of August 8,
> not a current release verdict. JobSpy now uses a shared serial scheduler,
> separate board adapters, execution deadlines excluding queue wait, and pinned,
> validated helper dependencies. Local process errors no longer impose the
> board-failure cooldown. These changes address the JobSpy-specific execution
> concerns, not every issue in P2-3/P2-7: the response still waits for all selected
> sources, and this work adds neither streaming nor source-health telemetry.
> See [request controls](jobspy-request-controls.md) for current behavior.

## Decision

**Do not describe this as a finished one-stop job/contract product yet.** It is a
credible, thoughtfully engineered alpha with a strong application-tracking core, but
the three customer-facing promises under review—effective discovery, Gatherer, and
messaging/automation—are either constrained well below user expectations or incomplete.
The next update should concentrate on completing those end-to-end product loops before
adding more sources or AI features.

No P0 (data exposure, irreversible loss, or a total authentication failure) was found
in this audit. Two P1 release blockers and six P2 product/reliability gaps were found.

## Scope and method

This is a source-and-local-verification audit of the repository as it existed on
2026-08-08. It reviewed the app routes and user flows, Prisma model/use boundaries,
adapter orchestration, configuration, CI, and automated tests. It deliberately did not
read `.env.local` or make live calls to job boards or AI services, so it does not claim
live-source uptime or disclose credentials.

Local verification:

| Check | Result |
|---|---|
| `npm.cmd run test:unit` | Pass: 34 files, 189 tests |
| `npx.cmd tsc --noEmit` | Pass |
| `npm.cmd run lint` | **Fail:** one React-purity error and one unused-variable warning |
| `npm.cmd run build` | Did not complete in this environment because `next/font/google` could not fetch Nunito; Turbopack also warned that database-path resolution caused the whole project to be traced. This is a real build portability risk, but not proof that a network-enabled production build fails. |

## Steel-man: why the foundation is sound

The team has built more than a demo. The core has several good product-safety and
engineering choices:

- Authentication, account ownership checks, and validation guard most user-scoped
  routes. The application tracker has a workable status workflow and per-user data
  ownership.
- The source layer is already normalized behind an adapter registry: eleven adapters
  declare capabilities, configuration, cache behavior, latency class, and source
  provenance. Requests have retries, deadlines, partial-failure isolation, structured
  source logs, caching, and an in-memory circuit breaker.
- The application-submission flow is intentionally cautious: it stops on CAPTCHA,
  never guesses legal/EEO controls, and requires a visible human review before a site
  can be submitted.
- AI egress is default-deny, and outreach is a draft/approve/mark-sent workflow rather
  than unsupervised sending. Privacy deletion and database-health paths also exist.
- The unit suite covers the adapter contract and several security, privacy, submission,
  and workflow units. Adapter additions have a documented fixture/contract-test path.

Those are exactly the bones worth preserving. The problem is that the user-facing
outcomes do not yet make those investments visible or reliable.

## Findings

### P1 — release blockers

| ID | Finding and evidence | Why it matters | Required outcome |
|---|---|---|---|
| P1-1 | **The release gate is red.** `npm run lint` fails on `app/applications/[id]/page.tsx:71`: React rejects `Date.now()` during render. `app/api/jobs/search/route.ts:64` also has an unused `suggestedTitles` assignment. CI executes lint before all later checks (`.github/workflows/ci.yml`). | A merge cannot be treated as a verified release while the required CI job fails. The current CI also does not run `verify:deployment` or `build`, so a green future lint run alone would still not prove deployability. | Fix the render impurity and warning; add `npm run verify:deployment` and a production build to CI; make the documented release command the required protection. |
| P1-2 | **Gatherer is nonfunctional or silent in its default state.** AI is disabled by default in `.env.example`. The discovery endpoint calls Claude directly (`app/api/job-boards/discover/route.ts:82-92`) and has no failure translation. The UI's `gather()` and `openGuide()` handlers (`components/JobBoardPanel.tsx:156-171, 174-188`) neither check `res.ok` nor catch rejected requests. | With the safe default, the endpoint throws an AI-disabled error. The browser handler then rejects without setting an error. The observed "nothing happened" report is consistent with this path and users are given neither a remedy nor confidence that the request was received. | Every Gather action must finish as one of: findings, a clearly worded empty result, or an actionable error (including AI not enabled). Add request timeout/cancellation and an observable server error with a correlation ID. |

### P2 — the next update's product-critical scope

| ID | Finding and evidence | Reasoning | Required outcome |
|---|---|---|---|
| P2-1 | **Search is deliberately a narrow title-phrase filter, not a job-seeking search experience.** The live route applies `matchesExactTitle()` to every result (`app/api/jobs/search/route.ts:37-46`). That function only checks whether the normalized query appears verbatim in the title (`lib/jobSources/titleMatch.ts:12-16`). It also always excludes `Senior`/`Sr.` titles and applies US-or-remote heuristics (`route.ts:41-44`, `lib/jobSources/locationFilter.ts`). | The implementation confirms the substance of the tester report, while correcting its language: it is substring phrase matching, not full equality. It misses ordinary aliases such as “backend developer” vs. “backend engineer,” adjacent roles, reordered words, and title/skill combinations. Hard-coded geography and seniority policy remove legitimate results without a user choice. | Replace one free-text title field with an editable search profile: title aliases, skills/keywords, excluded terms, location/work authorization, remote/hybrid, employment/contract type, and seniority. Retrieve broadly, rank/filter locally with explainable match reasons, and let the user opt into senior roles. |
| P2-2 | **The intended title-suggestion escape hatch is dead code.** `lib/ai/suggestJobTitles.ts` is implemented, but the live search route never invokes it; it initializes an empty value then always returns `suggestedTitles: []` (`app/api/jobs/search/route.ts:62-68`). | The UI advertises “Suggested titles to try,” but it can never show any. This turns an already restrictive design into a frustrating retry loop and is strong evidence of a partially landed feature. | Ship deterministic, user-editable aliases first; invoke optional AI suggestions only with explicit consent/availability and a graceful no-AI fallback. Add route and UI tests proving suggestions render and re-run a search. |
| P2-3 | **The timeout explanation has only low-to-moderate support; the more immediate latency defect may be the opposite.** HTTP adapters get a 15-second total context deadline (`lib/jobSources/timeoutConfig.ts:12-14`, `lib/jobAdapters/context.ts`), while JobSpy gets 90 seconds. Static adapters are awaited together in `runAdapterSearch()` and the page waits for the whole envelope. | There is no latency, timeout-rate, cache-hit, or zero-result telemetry, so the claim that 15 seconds causes a majority of empty searches cannot be established from this code. Fifteen seconds is defensible as an upper bound for a fast public API; blindly increasing it could worsen the experience. Conversely, a slow/blocked JobSpy can hold the interactive response for up to 90 seconds even if all fast sources have returned. A retrying fetch is also bounded by the parent 15-second context, not granted 15 seconds per retry. | Instrument per-source start/end, outcome, result count, cache hit, and timeout; use a 30-day sample to tune budgets. Return fast-source results progressively or separate slow scraping into a background refresh. Never tune the 15-second default until measured data says which sources need more time. |
| P2-4 | **Gatherer does not complete a user value loop.** “Add resource” opens a developer-oriented AI integration guide (`components/JobBoardPanel.tsx:285-321`; `app/api/job-boards/gather/integration-guide/route.ts`) rather than saving a resource. Training programs and government opportunities have no visible first-class record, status, or follow-up path. | Even when discovery succeeds, the user cannot reliably save, organize, revisit, or act on most findings. A code snippet is appropriate for an internal developer console, not a job-seeker’s “add resource” action. | Persist findings as user-owned resources/candidates with category, URL, provenance, verification time, notes, and status. Make the primary actions **Save**, **Open**, **Track opportunity**, and (for recognized ATS URLs) **Add to search pool**. Move adapter code-generation behind an internal/admin workflow. |
| P2-5 | **Messaging is an embedded draft widget, not the promised module/tab.** There is no Messages route or primary-nav item (`app/layout.tsx`). `MessagePanel` is only rendered on one application-detail page (`app/applications/[id]/page.tsx:7, 66-72`). Its “send” action only changes the local status to `SENT` (`app/api/messages/[id]/sent/route.ts`); the only launch action is a recipient-less `mailto:?body=...` link (`components/MessagePanel.tsx:135-140`). | The tester report is accurate at the product level. Drafting is a useful foundation, but users cannot see an outreach queue, connect messages to recipients/conversations, schedule them, or send through a connected channel. Marking something sent is not messaging delivery. | Add an **Outreach** tab with a cross-application queue, recipient/contact fields, status, search, and review. Preserve human approval. Start with copy/email-client handoff that includes recipient and subject; add a provider integration only after explicit account connection, audit events, consent, retries, and idempotency are designed. |
| P2-6 | **“Automation” runs only when a user opens the dashboard.** `runStaleCheck()` is invoked during dashboard rendering (`app/dashboard/page.tsx:18`); `listFollowUpDue()` only queries records for display. No worker, scheduler, cron deployment definition, notification service, or durable job queue was found. | A follow-up cannot become due, be surfaced, or be notified while the user is away. This is acceptable for a local tracker, but not for a one-stop automation claim. | Add a durable scheduled-job mechanism appropriate to the deployment model, with user timezone, idempotency keys, retry/dead-letter handling, preference controls, and in-app/email notification. Keep “generate draft” separate from “send.” |
| P2-7 | **Source availability and execution limits are incomplete at real-user scale.** Unconfigured adapters are silently omitted by `listConfiguredAdapters()` (`lib/jobAdapters/registry.ts:44-46`); the search UI does not present a configured/unconfigured/last-success summary. Every adapter declares `maxConcurrency`, including `1` for JobSpy, but no production code consumes that field. The rate limiter is in-memory and cannot be cancelled while waiting (`lib/jobAdapters/services/rateLimiter.ts`). | A user cannot distinguish “there are no jobs” from “this source is disabled, blocked, timed out, or unavailable.” Under concurrent use, multiple JobSpy processes may run despite a declared limit, and rate-limit waiting can outlive the request’s intended search deadline. | Enforce per-adapter semaphores and cancellation-aware queues. Surface a source-health panel with configured state, last successful search, result/error/timeout counts, and a retry control. Persist shared limits/breaker state before a multi-instance deployment. |

### P3 — important follow-through and maintainability

| ID | Finding | Recommendation |
|---|---|---|
| P3-1 | The root README is the untouched Next.js starter text, and a number of adapter comments still say the path is “not wired” even though `app/api/jobs/search` uses it. Product setup, required optional services, known source limits, and support triage are therefore unclear. | Replace the README with a product/operator guide; make the adapter architecture document current; add a configuration/status screen rather than relying on logs and `.env` edits. |
| P3-2 | Production build portability depends on downloading a Google font at build time; this audit’s build failed when that request was unavailable. The database module’s dynamic `path.resolve(process.cwd(), dbFile)` triggers a Turbopack trace warning. | Self-host or provide a build-safe font fallback; remove/scope the dynamic path pattern; exercise the production build in CI in an environment representative of deployment. |
| P3-3 | The current tests are strong at unit/adapter-contract level but do not cover Gatherer failure/success UX, full search relevance/aliases, source configuration transparency, messaging navigation, or scheduled automation. Existing search E2E tests mock the search endpoint. | Add contract/API/UI tests for every P1/P2 acceptance case; retain captured fixtures and add a controlled staging smoke check where external credentials are available. |

## Evaluation of the reported timeout claim

**Verdict: plausible but unproven (approximately 35–45% confidence that the 15-second
HTTP timeout itself is the principal cause of frequent empty results).** The reported
65% confidence should not be upgraded without measurements.

- Confirmed: fast HTTP adapters share a 15,000 ms deadline; errors should appear in
  their source group rather than silently turning into a successful empty response.
- Confirmed: JobSpy has a separate 90,000 ms deadline and, because the response waits
  for all adapters, can make an interactive search feel stalled.
- Confirmed: strict post-fetch filtering can convert many upstream results into empty
  groups without any source timeout; this is the more directly evidenced explanation
  for “most searches return nothing.”
- Unknown: per-source latency distribution, real timeout counts, how many sources are
  configured in affected installs, API upstream behavior, cache-hit rate, and whether
  a tester interpreted a per-source error as “no results.”

The correct response is a measured service-level policy: fast sources should make the
first usable page available promptly; slow/scraped sources should update it later; the
UI should name delayed/failed sources; and settings should have bounded, documented
timeouts rather than a single hidden number.

## Recommended next big update: “Job Seeker Command Center”

### Phase 0 — restore a releasable baseline (first)

1. Fix P1-1 and make lint, types, unit tests, deployment-config verification, build,
   and E2E mandatory CI checks.
2. Add a shared API error envelope and client error state for Gatherer and integration
   guidance. Explicitly show “AI assistance is not enabled” and how an operator/user
   can proceed; never leave a spinner or a no-op.
3. Add product analytics/operational events without storing job-seeker content:
   search ID, adapter ID, duration, cache state, outcome/error kind, pre/post-filter
   counts, and Gatherer state. Protect this data by retention limits and user/admin
   access controls.

**Exit criteria:** all release checks pass; every button in Gatherer and messaging has
a visible success/failure result; support can answer why a search produced zero jobs.

### Phase 1 — make search useful before making it larger

1. Introduce a saved, editable search profile with aliases, skills, exclusions,
   location, remote/hybrid, work authorization, seniority, pay, and job/contract type.
2. Change the pipeline to broad retrieval plus explainable local scoring. Do not use
   an LLM as the only matcher; deterministic alias/token/skill matching should work
   when AI is unavailable. Present match reasons and filters so a user can correct
   the profile.
3. Put fast API results on screen independently of JobSpy; make slow-source progress
   visible and merge later results without resetting the user’s work. Enforce declared
   per-source concurrency and cancellation.
4. Build source health/settings: configured state, credentials required (never their
   values), last success, request latency, errors, disabled controls, and retry.

**Exit criteria:** representative alias queries return relevant results; a user can
turn off the seniority/US constraints; P95 first results meet the chosen interactive
target; all zero-result states explain whether the cause was filtering, configuration,
or upstream failure.

### Phase 2 — turn Gatherer into a resource workflow

1. Define its consumer promise: discovery of boards, training programs, public-sector
   opportunities, and contractor resources—not generation of developer code.
2. Create a resource/candidate model and a review inbox with source, category,
   verification timestamp, owner, notes, save/archive/track actions, and links to
   applications or searches.
3. Let users save a find immediately. For a known ATS board, offer verified pool
   enrollment; for other sites, provide a labeled browse-only bookmark. Keep any
   adapter proposal in an internal review queue.
4. Add explicit empty, partial, disabled-AI, timeout, and provider-error states and
   test all of them.

**Exit criteria:** a user can go from a query to a durable, actionable resource in one
session, and every discovery request has an intelligible outcome.

### Phase 3 — deliver outreach and dependable automation

1. Add a first-class Outreach tab with a unified draft/review queue, recipient,
   company/application context, subject/body, schedule, status, audit trail, and
   filters.
2. Keep human approval as the default. Offer safe handoff first; introduce connected
   email/provider sending only with explicit authorization, unsubscribe/compliance
   rules, delivery webhooks, retries, and idempotency.
3. Implement a durable scheduler and notification preferences so follow-up/stale
   reviews occur without a dashboard visit. Use timezone-aware schedules and a clear
   “never send automatically” policy until a user opts in.
4. Plan the contract extension as a separate vertical: engagements/clients, rate and
   term, milestones, documents, invoice/reminder status, and searchable renewal dates.
   Do not imply it is already present.

**Exit criteria:** users can find every planned outreach action in one place, are
notified when review is due, and can distinguish “drafted,” “approved,” “handed off,”
and provider-confirmed “sent.”

### Phase 4 — scale and trust

1. Move source rate limits, circuit-breaker state, and background jobs to durable
   shared infrastructure if this leaves the local-first/single-process model.
2. Run daily source health/fixture drift checks and alert on availability, schema, and
   relevance regressions. Maintain ToS and data-retention records per source.
3. Add production observability dashboards for search success, zero-result cause,
   source latency, Gatherer completion, outreach completion, and application funnel
   outcomes. Use these—not anecdotes—to sequence future source integrations.

## Product principle for the update

The product should make the user feel continuously oriented: **what was searched,
what worked, what did not, what is waiting for review, and the next safe action.**
That is more transformative for job seekers than adding another opaque source or another
AI button. The existing safety-oriented architecture can support this once the visible
workflows are completed.
