# Adapter interface design (Phase 2)

This is the Phase 2 design record, not a verbatim copy of the current API. The
adapter migration is implemented; historical rationale and legacy source citations
below describe the code at design time. Current contracts live in
[`lib/jobAdapters/types.ts`](../lib/jobAdapters/types.ts); use
[Adding a job source](adding-a-source.md) for implementation guidance.

**Execution update (2026-09-21):** JobSpy now has five per-board adapters sharing
a serial scheduler, rather than one adapter scraping all boards. Context timers
start on first signal/deadline access at execution; queue wait is excluded.
Local subprocess/parse failures propagate without a board-failure cooldown.
The helper validates pinned `python-jobspy==1.1.82` and its private request hooks
before scraping. See [JobSpy request controls](jobspy-request-controls.md).

## 2a. The normalized job record

```ts
type SchemaVersion = 1;

interface NormalizedJobListing {
  schemaVersion: SchemaVersion; // required — bump on any breaking shape change

  // ---- Identity ----
  sourceId: string;        // required — the adapter's registry key, e.g. "adzuna", "greenhouse:acme-co"
  sourceJobId: string;     // required — source's native id/slug when it has one
  idIsDerived: boolean;    // required — true when sourceJobId was synthesized (see rule below, outlier #7)
  canonicalUrl: string;    // required — direct link to the original posting; every source in this app already provides one
  applyUrl: string | null; // nullable — a distinct apply-flow URL when the source exposes one separate from canonicalUrl; null when there's no such distinction (true of every current connector)

  // ---- Core ----
  title: string;                    // required
  company: string | null;           // nullable — see rule below; today's connectors mostly fall back to the literal "Unknown" (e.g. remoteOk.ts:53), which this schema treats as an adapter migrating to null instead (a deliberate, noted behavior change, not preserved as-is)
  descriptionHtml: string | null;   // nullable
  descriptionText: string | null;   // nullable — at least one of descriptionHtml/descriptionText should be non-null when the source provides any description at all; both null means the source gave none, not that extraction failed silently
  postedAt: string | null;          // ISO 8601, nullable — see outlier #6
  fetchedAt: string;                // required, ISO 8601 — stamped once by orchestration per search batch (NormalizeContext.fetchedAt), not by the adapter, so every listing in one batch shares an identical value rather than drifting across a slow multi-page fetch

  // ---- Location (structured, never a single free-text blob) ----
  location: {
    raw: string | null;      // the source's own free-text string, verbatim
    remote: boolean | null;  // null = source doesn't say; true/false = explicit or structurally known (e.g. Remotive/Himalayas/Jobicy/RemoteOK are remote-only by construction, cf. locationFilter.ts's REMOTE_ONLY_SOURCES)
    country: string | null;  // ISO 3166-1 alpha-2, nullable — set only from structural knowledge (e.g. Adzuna queried with country=us, USAJobs is US federal) or an explicit source field, never parsed/guessed from prose
    region: string | null;   // state/province, nullable
    city: string | null;     // nullable
  };

  // ---- Compensation ----
  compensation: {
    min: number | null;
    max: number | null;
    currency: string | null;                                    // ISO 4217, nullable
    period: "year" | "hour" | "month" | "day" | "project" | null;
    isEstimate: boolean;    // required — true only when the SOURCE itself labels the figure as an estimate/range, not when the adapter is merely unsure. "We don't know" is expressed by min/max/currency all being null, never by isEstimate.
  };

  // ---- Employment ----
  employment: {
    type: "full-time" | "part-time" | "contract" | "temporary" | null;
    seniorityHint: string | null; // a verbatim signal the source itself provides (e.g. a level field); NEVER inferred from title text inside an adapter — title-based seniority inference is a later, auditable pipeline stage (this app already has one: lib/jobSources/titleMatch.ts's isSeniorTitle — which stays a post-merge orchestration step, not something adapters do internally)
  };

  // ---- Provenance (exists for the dedup stage — see outlier #12) ----
  provenance: {
    sourceKind: "direct-employer" | "ats" | "aggregator" | "scraped-board"; // required — declared by the adapter's own metadata (2b), never computed per-listing
    posterIsLikelyAgency: boolean | null; // null = adapter has no opinion and orchestration's existing heuristic (lib/jobSources/staffingAgencies.ts) is the fallback; true/false = the adapter itself knows for certain (e.g. a Greenhouse/Lever board adapter is definitionally never agency-posted)
    originalSourceUrl: string | null;     // set when an aggregator discloses the original employer posting URL distinct from canonicalUrl
  };

  raw: unknown; // required — untouched upstream payload exactly as received, always preserved
}
```

**Rules** (apply to every adapter, stated once here rather than repeated per field):

1. **Adapters never invent data.** Missing salary is `compensation.min/max: null`, not `0` and not a number parsed out of the description's prose. Missing seniority is `employment.seniorityHint: null`, not a guess from the title. Any such inference is a separate, later, auditable pipeline stage — outside adapters and outside this refactor's scope entirely (per the task's own standing rule not to touch filtering/ranking logic here).
2. **`company: string | null`, not a placeholder.** Several existing connectors fall back to the literal string `"Unknown"` today (`remoteOk.ts:53`, `remotive.ts:44`, `arbeitnow.ts:49`, `jooble.ts:49`). Under this schema that becomes `null` — consistent with the "missing is null" rule elsewhere, and it lets a consuming UI/dedup stage tell "the source said Unknown" (which never actually happens) apart from "the source said nothing." This is a deliberate, visible behavior change for the migration to make, not a silent preservation of today's fallback string.
3. **A schema-satisfying record is still allowed to be structurally sparse.** A bare title with every other field null is valid — the schema doesn't require richness, only honesty about what's missing.

## 2b. The adapter interface

```ts
interface AdapterMetadata {
  id: string;             // stable registry key, e.g. "adzuna", "jobspy:indeed"; company ATS adapters are parameterized by target at query time
  displayName: string;
  homepage: string;
  tosNotes: string;       // free text — ToS/robots.txt restrictions, attribution requirements, scraping risk, etc.
  sourceKind: NormalizedJobListing["provenance"]["sourceKind"];
}

interface AdapterCapabilities {
  supportsKeywordQuery: boolean;
  supportsLocationFilter: boolean;
  supportsRemoteFilter: boolean;
  supportsDateFilter: boolean;
  supportsSalaryFilter: boolean;
  queryModel: "keyword-search" | "enumerate-target" | "full-dump"; // see 2c — "enumerate-target" replaces the brief's separate "enumerate-board" to also cover URL-crawl adapters (outlier #5); same shape, same problem
  paginationStyle: "page" | "offset" | "cursor" | "none";
  requiresDetailFetch: boolean;
  runtime: "node" | "subprocess" | "sidecar-http" | "headless-browser";
  cost: { tier: "free" | "quota-limited" | "metered"; quotaUnit?: string; quotaPerInterval?: number; interval?: "second" | "minute" | "day" };
  latencyClass: "fast" | "slow" | "very-slow"; // <2s | 2-20s | >20s
  cacheable: boolean;
  cacheTtlSeconds: number | null;   // null when cacheable is false
  tosForbidsStorage: boolean;       // when true, wins over cacheable unconditionally — see outlier #10
  maxConcurrency: number;           // per-source, not global
}

interface AdapterConfigField {
  envVar: string;
  required: boolean;
  description: string;
}

type NormalizedQuery =
  | { kind: "keywords"; keywords: string; location: string | null; remoteOnly: boolean }
  | { kind: "target"; target: string }; // a company slug/token (Greenhouse/Lever/Ashby) OR an arbitrary URL (JSON-LD crawl) — which one is up to the adapter that declared queryModel: "enumerate-target"; orchestration doesn't need to know which

interface AdapterPage<TRaw> {
  items: TRaw[];
  nextCursor: string | null; // null = no more pages; paginationStyle: "none" adapters always yield exactly one page with nextCursor: null
  partial: boolean;          // true when this page is a best-effort/truncated result (outlier #8) rather than a clean end-of-results
}

interface AdapterContext {
  signal: AbortSignal;   // first signal/deadline access starts the per-adapter execution timeout; queued adapters defer access until dequeued
  deadline: number;      // epoch ms for that same timeout; reading it starts the timer if signal has not been read
  logger: Logger;        // structured, pre-bound with correlationId + sourceId
  rateLimiter: RateLimiterHandle;
  cache: CacheHandle;
  correlationId: string;
}

interface NormalizeContext {
  fetchedAt: string; // stamped once per search batch by orchestration, not per-adapter — see 2a
}

interface Adapter<TRaw = unknown> {
  metadata: AdapterMetadata;
  capabilities: AdapterCapabilities;
  configSchema: AdapterConfigField[];
  isConfigured(): boolean; // cheap, synchronous — identical contract to today's JobSourceConnector.isConfigured()
  healthCheck(ctx: AdapterContext): Promise<{ ok: boolean; detail?: string }>;
  search(query: NormalizedQuery, ctx: AdapterContext): AsyncGenerator<AdapterPage<TRaw>>;
  fetchDetail?(job: NormalizedJobListing, ctx: AdapterContext): Promise<TRaw>;
  normalize(rawItem: TRaw, ctx: NormalizeContext): NormalizedJobListing; // pure — no network, no ctx.cache/ctx.rateLimiter access
}
```

Note on `search()`'s generator contract, made explicit because outlier #8 depends on it:
an adapter's generator must never let a mid-stream page's failure discard pages it
already yielded — it catches that page's own error internally and ends the generator
early with a final `{ items: [], partial: true, nextCursor: <resume token or null> }`
rather than throwing. This is a documented rule every adapter follows, not something
orchestration special-cases per adapter.

## 2c. Capability flags, with rationale tied to this repo's actual sources

| Flag | Why it exists, grounded in a real source |
|---|---|
| `supportsKeywordQuery` | `false` for RemoteOK/Arbeitnow (full-dump feeds, filtered locally today — `remoteOk.ts:44-49`, `arbeitnow.ts:42-45`) and for Greenhouse/Lever (no native search — `greenhouseBoard.ts:29-32`, `leverBoard.ts:23-26`). `true` for Adzuna/USAJobs/Jooble/Remotive/Himalayas/Jobicy, which all send a keyword param upstream. |
| `supportsLocationFilter` / `supportsRemoteFilter` | Distinguishes sources that accept a location/remote param upstream (Adzuna, USAJobs) from those that can't (Himalayas/Jobicy 400 on free-text location — documented in `himalayas.ts:29-33`, `jobicy.ts:32-36` — so this app already relies on its own post-filter for them). Directly replaces the hardcoded `REMOTE_ONLY_SOURCES`/`ALWAYS_US_SOURCES` sets in `locationFilter.ts` (audit §3, item 2) with a per-adapter declaration instead of a shared file's name-keyed `Set`. |
| `supportsDateFilter` / `supportsSalaryFilter` | None of today's 11 sources support either upstream — both `false` everywhere today. Declared now so a future source that does (many ATS APIs support a "posted since" filter) doesn't need a core change to take advantage of it. |
| `queryModel` | The load-bearing flag — see outliers #1, #4, #5 in 2d. |
| `paginationStyle` | `"none"` for every current connector except Adzuna, which hardcodes page 1 today (`adzuna.ts:38`) but is `"page"`-capable per its own API; migrating it can request further pages through the same generator contract other adapters already use, for free. |
| `requiresDetailFetch` | `false` for every current connector — none of them today do a separate detail-page fetch; Greenhouse's `?content=true` (`greenhouseBoard.ts:23`) already gets the full description in the list call. Kept in the interface for a future source that only returns truncated descriptions in its list endpoint. |
| `runtime` | `"node"` for fetch-based adapters; `"subprocess"` for each JobSpy board (`lib/jobAdapters/adapters/jobspy/index.ts`); `"headless-browser"` reserved for future browser-backed sources. |
| `cost` | Nothing today tracks quota (audit §7/Open Question #5) — every adapter's `cost` would be a **new** declaration sourced from each API's public docs, not derived from existing code. Adzuna: `{ tier: "quota-limited", quotaUnit: "calls", interval: "day" }` (exact number not in this repo — needs Adzuna's current published limit, a Phase 3 config-time fact, not guessed here). |
| `latencyClass` | JobSpy boards declare `"very-slow"` and receive `JOBSPY_TIMEOUT_MS` each (90 seconds by default). `context.ts` derives the execution budget from this flag; queued scrapes start the timer when dequeued, not when their contexts are created. |
| `cacheable` / `cacheTtlSeconds` | Already real, shipped infrastructure — every current connector is cached today via `lib/jobSources/cache.ts` with one global TTL (`JOB_CACHE_TTL_MINUTES`). This flag lets a future adapter opt out (`cacheable: false`) or use a different TTL, which the current one-size-fits-all cache can't express. |
| `tosForbidsStorage` | `false` for everything today (no ToS in this repo's comments claims to forbid storage — several ask for attribution, which is a different constraint already satisfied by every connector's `label` + link-back). Exists for a hypothetical stricter future source. See outlier #10. |
| `maxConcurrency` | A capability declaration, not a generic semaphore in orchestration. JobSpy boards declare `1`; their shared `scrapeScheduler.ts` actually enforces one subprocess across all boards and searches, joining identical in-flight queries. |

## 2d. Proving the design against the outliers

1. **RemoteOK — full dump, no server-side keyword filter, legal notice at index 0.**
   `queryModel: "full-dump"`, `supportsKeywordQuery: false`. `search()` still receives
   `{ kind: "keywords", ... }` like every adapter (full-dump adapters use it for local
   filtering, keyword-search adapters send it upstream) — orchestration doesn't need a
   different query shape per queryModel, just a different adapter-internal behavior.
   The index-0 legal-notice guard (`item.id && item.position && item.url`,
   `remoteOk.ts:41-43`) stays entirely inside this adapter's own `search()`/`normalize()`
   — it's the adapter's own data-shape knowledge, never a core special case. One genuine
   simplification falls out of this design: since orchestration already re-filters
   *every* source's listings uniformly after merge regardless of queryModel
   (`app/api/jobs/search/route.ts:42-51`, audit §4), a migrated RemoteOK adapter no
   longer needs to do its own local keyword filter at all (`remoteOk.ts:44-49` becomes
   dead code) — the uniform post-filter already covers it. Noted as a migration-time
   cleanup, not something to act on now.

2. **Adzuna — per-country paths, app id+key, page-numbered, daily quota.** Base URL
   isn't a capability-visible constant — it's built inside the adapter's own `search()`,
   exactly as `adzuna.ts:38` does today; the interface never asked adapters to declare a
   static `baseUrl` string, only a `configSchema` for credentials. Multi-country: stays
   an adapter-internal decision (hardcode `"us"` as today, or add an optional
   `ADZUNA_COUNTRY` config field) — not forced by this design either way.
   `paginationStyle: "page"` plus the async-generator contract means a migrated Adzuna
   adapter can walk pages 2, 3, ... as the caller iterates, instead of the hardcoded
   page-1-only behavior today — a capability upgrade, not a special case. The daily
   quota is `cost: { tier: "quota-limited", quotaUnit: "calls", interval: "day" }`,
   enforced by a shared `ctx.rateLimiter` keyed on `adapter.metadata.id` — generic
   quota-bucket logic in orchestration, zero Adzuna-specific code in core.

3. **JobSpy — per-board subprocesses and partial results (updated 2026-09-21).**
   `JOBSPY_BOARDS` in `lib/jobSpyBoards.ts` generates five adapters with
   `runtime: "subprocess"` and `latencyClass: "very-slow"`. Each helper invocation
   scrapes one board and returns `site`, `items`, `status`, `details`, and
   `retryAfterSeconds`. Captured request failures and logged errors distinguish
   failed/partial scrapes from successful empty results.

   The scheduler receives `getSignal: () => ctx.signal` and calls it only after
   dequeuing. Its `run(signal)` callback uses that same signal for the subprocess.
   Context creation, cache checks, and queue wait do not consume the execution
   budget. Do not read or spread the context before execution if the work is queued:
   accessing either timing getter starts the timer.

   Valid failure envelopes may extend a board cooldown. Local timeout, abort,
   setup, JSON parse, or invalid-envelope errors instead propagate; normal request
   spacing remains. An aborted child must close before the queue advances.
   Partial pages carry a warning and do not replace the last successful cache;
   failures may fall back to cached listings up to 24 hours old.

4. **Greenhouse/Lever/Ashby — board-scoped, company slug required, no keyword search.**
   `queryModel: "enumerate-target"`, `NormalizedQuery = { kind: "target", target: <slug> }`.
   The "company-list input source" the outlier calls for **already exists in this
   repo** — `JobBoardPin` rows, populated when a user pins a board URL and
   `detectBoardIntegration()` recognizes it (`app/api/job-boards/[id]/pool/route.ts`).
   What changes under this design: `detectBoardIntegration`'s closed
   `"greenhouse" | "lever"` union and hardcoded hostname list (audit §3, item 5) — today
   a shared file outside either adapter's own module — becomes each `enumerate-target`
   adapter's own responsibility: it exposes a `detectTarget(url): string | null`
   function (part of that adapter's file, not a shared one), and orchestration tries
   every registered `enumerate-target` adapter's detector in turn until one matches.
   Adding Ashby means adding `lib/jobSources/ashby/` with its own detector — zero edits
   to `detectIntegration.ts`, `searchPoolBoards.ts`, or
   `app/api/job-boards/[id]/pool/route.ts` (today's two duplicated
   `integrationType === "greenhouse" ? ... : ...` conditionals, audit §3 items 3-4, both
   disappear — replaced by "call whichever adapter's `metadata.id` matches the pin's
   stored source key," a single generic lookup).

5. **JSON-LD crawling of arbitrary career pages — input is a URL, not a keyword; 0-50
   jobs; page may be JS-rendered.** Same `queryModel: "enumerate-target"` as #4 — the
   `target` string is just a URL instead of a platform-recognized slug; orchestration
   doesn't need to know or care which. `runtime: "headless-browser"` if rendering is
   required (vs. `"node"` for a plain fetchable JSON-LD page) — this is precisely why
   `runtime` is capability-declared rather than assumed: orchestration's execution
   strategy (spawn Playwright vs. plain `fetch`) branches on the flag, not on "is this
   the crawler adapter." `paginationStyle: "none"` — one URL is one page, always;
   0 jobs is simply an empty `items` array, not an error.

6. **Relative or missing dates ("3 days ago", or nothing at all).** `postedAt: string |
   null` (2a) is nullable specifically for this. Each adapter's own `normalize()`
   converts its source's native date representation into absolute ISO 8601 — already
   true of today's code (`arbeitnow.ts:53` converts unix seconds; USAJobs/Adzuna pass
   through an already-ISO `created`/`PublicationStartDate` string as-is). Documented
   fallback: if an adapter cannot confidently parse a date (an ambiguous relative
   string, or a source that omits it entirely), `postedAt: null` — never a guessed
   absolute date. No shared date-parsing utility is required by the interface; one
   *may* exist as an opt-in convenience for scraped-board adapters that need relative-
   date parsing, but nothing here forces every adapter to depend on it.

7. **A source with no stable job ID.** `idIsDerived: boolean` (2a) exists exactly for
   this — the adapter derives a deterministic surrogate (e.g. a hash of
   `title + company + canonicalUrl`) and sets `sourceJobId` to it with
   `idIsDerived: true`, so downstream consumers (caching, dedup) can tell a derived ID
   apart from a source-native one without inspecting `raw`.

8. **Rate-limited mid-pagination (429 on page 4 of 10).** The generator yields pages 1-3
   normally, then on page 4's 429 catches that page's own error internally and ends the
   generator with one final `{ items: [], partial: true, nextCursor: <page-4-resume-token> }`
   instead of throwing (2b's generator contract). Orchestration's normal "iterate until
   done" loop over the generator naturally keeps pages 1-3's real data. Whether a
   *future* search actually resumes from that cursor is an orchestration policy
   decision for Phase 3, not something this interface needs to force today — the
   contract just makes it possible without a later interface change.

9. **A flaky/down source.** Two layers, one already real: the per-connector timeout
   fix that landed in this repo ahead of this document
   (`lib/jobSources/timeoutConfig.ts`, `docs/decisions.md`) already means a hung source
   degrades gracefully in production, today — proof this pattern works, not just a
   paper design. The interface's contribution on top is a genuine circuit breaker: a
   shared `ctx.circuitBreaker` handle (sibling to `ctx.rateLimiter`), keyed by
   `adapter.metadata.id`, that orchestration checks *before* calling `search()` at all —
   after N consecutive failures it skips calling that adapter for a cooldown window and
   synthesizes `{ sourceId, kind: "circuit-open", retryable: true }` directly into
   `errors[]`. No adapter ever checks its own breaker state; this lives entirely in
   shared orchestration code, generic over any `sourceId`.

10. **A source whose ToS forbids caching/storage.** `capabilities.tosForbidsStorage`
    (2c) — checked once, in the shared cache-write path (the code backing today's
    `lib/jobSources/cache.ts`), before writing anything for that adapter to
    `JobSourceCache`. Documented rule: `tosForbidsStorage: true` always overrides
    `cacheable`/`cacheTtlSeconds`, regardless of what they're set to. One `if` in shared
    code, checking a declared flag — never a name check against a specific adapter.

11. **Non-English postings, non-USD salaries.** `compensation.currency: string | null`
    (ISO 4217) is the only currency-related field — no conversion logic anywhere in an
    adapter or in core. Titles/descriptions pass through verbatim in whatever language
    the source used; no translation field exists, because adding one would imply this
    refactor does translation, which it explicitly doesn't. Any future currency
    normalization or translation is, like salary/seniority inference (rule #1, 2a), a
    separate later pipeline stage — out of scope here by the task's own standing rules.

12. **Two sources returning the same job.** The `provenance` block (2a) —
    `sourceKind` + `posterIsLikelyAgency` — is sufficient for a downstream dedup stage
    to prefer a direct-employer posting over an aggregator/agency repost, which is
    exactly what this repo's already-shipped `lib/jobSources/dedupe.ts` does today via
    its own `isStaffingAgency(company)` heuristic. This is the concrete shape of the
    "dedup optimization in light of the new direction" flagged as deferred in
    `docs/decisions.md`: once adapters populate `provenance` directly, `dedupe.ts` can
    prefer a declared `sourceKind: "ats"`/`posterIsLikelyAgency: false` fact over
    recomputing its own heuristic on every call, falling back to the heuristic only
    when an adapter reports `posterIsLikelyAgency: null`. Not implemented in this
    document — proposed here as the schema that makes it possible later, per your
    instruction to revisit dedup once this groundwork exists, not before.

The original outlier analysis motivated the shared adapter contract. JobSpy's
previously open per-board accounting question is now handled by separate adapters
and explicit helper status envelopes, not inferred from missing board listings.
The generic `AdapterPage.partial`/warning and `SearchEnvelope.errors` paths carry
those outcomes. The remaining historical design rationale is preserved above.

## 2e. Failure semantics

```ts
interface SearchEnvelope {
  results: JobSearchResultGroup[]; // same per-source grouping shape as today's JobSearchResult[]
  errors: SearchError[];
  meta: {
    perSourceTiming: Record<string, { startedAt: string; durationMs: number }>;
    degraded: boolean; // true whenever errors.length > 0
  };
}

interface SearchError {
  sourceId: string;
  kind: "timeout" | "http-error" | "parse-error" | "circuit-open" | "unconfigured" | "aborted" | "unknown";
  message: string;
  retryable: boolean;
}
```

A failing adapter — whether it throws, its generator ends early with an error, or its
circuit breaker is already open — produces one `SearchError` entry. It never rejects
the overall search. This is a formalization of a pattern already correct and proven in
this repo's current code: every connector call in `lib/jobSources/index.ts` and
`searchPoolBoards.ts` is already wrapped so a throw becomes
`{ source, label, listings: [], error: message }` rather than a rejected promise
(audit §5) — `errors[]` replaces that inline per-group `error?: string` field with a
richer, typed, top-level array (`kind`/`retryable` add exactly the classification that
was missing, per audit §8's "no error-kind categorization" finding), while
`results[i].listings` stays empty for that source, same as today. `meta.degraded` gives
the frontend a single boolean to show "results are partial" without inspecting
`errors.length` itself.

---

**Implementation status:** the Phase 2 review checkpoint is complete. See
[the decision log](decisions.md) for the migration and later execution changes.
