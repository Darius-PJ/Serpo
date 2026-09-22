# Job-Source Architecture Audit (Phase 0)

> **Status (2026-07-29): superseded by the finished migration.** Everything below
> describes the pre-refactor state this audit found — kept as-is, historical, not
> rewritten in place. All 11 sources this audit inventoried are now
> `lib/jobAdapters/adapters/` entries; the legacy `lib/jobSources/` connector registry,
> `searchAllSources`/`searchPoolBoards`, and `detectIntegration.ts` this document
> describes have been deleted. See `docs/decisions.md`'s Phase 4/5 entries for what
> changed and why, and `docs/adding-a-source.md` for how the codebase works now.
>
> **JobSpy update (2026-09-21):** the all-boards subprocess and installation blocker
> described below are historical. Current sourcing uses five board adapters, a
> shared serial queue with per-execution deadlines, board-only failure cooldowns,
> and validated `python-jobspy==1.1.82`. See [request controls](jobspy-request-controls.md)
> and the [current architecture](ARCHITECTURE.md).

Scope: this document is a read-only inventory of how `job-tracker` fetches, filters,
dedups, and returns job/contract listings today. No application code was changed to
produce it. Every claim is either a direct citation of code/comments in this repo, or
explicitly marked as unverified. Nothing here was confirmed with a live network call —
per this project's established convention of not making live external-API calls during
iterative/verification work, live probing (if needed) is deferred to Phase 1's fixture
capture, which is the phase actually designed for it.

> **Phase 1 update (2026-07-29):** live fixture capture has since happened — see
> `tests/fixtures/<source>/` and the "Phase 1 fixture inventory" note below. Two of this
> audit's original inventory claims (Remotive's and Himalayas' keyword filters) turned
> out to be wrong once actually tested; both are corrected in place below, marked ⚠️,
> rather than silently rewritten.

### Phase 1 fixture inventory (added 2026-07-29)

Real responses were captured live for 8 of the 11 source modules; the shortfalls were
recorded honestly rather than fabricated, per the task's own rule:

| Source | Fixtures | Notes |
|---|---|---|
| adzuna | typical, empty, error (401) | Clean triad — a genuinely empty result set and a genuine auth error, both real |
| remoteok | typical, empty (derived), error (not reproduced) | Full-dump source — no server-side query exists to produce a separate "empty" HTTP response; "empty" is the same real dump, verified to yield zero matches under the connector's own local filter. The code comment claiming RemoteOK blocks a generic User-Agent did **not** reproduce live (identical 200 response) — recorded honestly in `error-not-reproduced.json`, not faked |
| remotive | typical, "empty" (⚠️ finding), error (404) | The "empty" query returned the same 35 real jobs as the typical query — `search` doesn't reliably filter server-side (see finding file) |
| himalayas | typical, "empty" (⚠️ finding), error (400) | Same finding as Remotive — `q` returned 19 different-but-real jobs for a nonsense query, not zero |
| jobicy | typical, empty, error (400) | Clean triad — genuinely filters, genuinely 400s on free-text `geo` per the connector's own comment |
| arbeitnow | typical, empty (derived), error (not reproduced) | Same full-dump situation as RemoteOK; a wrong-path request returned 200 with different (but still real) data rather than a genuine error |
| greenhouse | typical (real Stripe board, 533 jobs live, trimmed to 5 for the fixture), empty (derived), error (404) | `detectBoardIntegration`'s target discovery works; Stripe was found live after trying several real companies |
| lever | error (404) only | ~40 real companies commonly associated with Lever were live-checked; **none** resolved to a currently-live board as of 2026-07-29 (`tests/fixtures/lever/typical-not-found.json`) — plausibly ATS migrations since training data. Not fabricated |
| usajobs | none | Unconfigured in this environment (`USAJOBS_USER_AGENT` is empty in `.env.local`) — not guessing the registered email needed to complete this |
| jooble | none | Unconfigured in this environment (no `JOOBLE_API_KEY` at all) |
| jobspy | none | `pip install python-jobspy` (approved by the user) failed: it hard-pins `numpy==1.26.3`, which has no prebuilt wheel for this machine's Python 3.13 and needs a C/C++ compiler to build from source, unavailable here. Not pursued further (installing a build toolchain wasn't part of what was approved) |

**HTTP interception**: MSW (`msw/node`'s `setupServer`) was chosen over nock/Polly.js
— proposed to and approved by the user — specifically because every connector in this
app calls native `fetch()` directly, which MSW's interceptor engine supports natively;
nock's fetch/undici support is comparatively weaker, and Polly.js pushes toward
auto-recorded VCR-style cassettes rather than the small, hand-reviewed fixture files
this phase produced. See `docs/decisions.md`.

**Characterization tests**: `tests/unit/jobSources/characterization/*.test.ts` — one
file per source, replaying its real fixtures through the real connector code via MSW
(zero live calls in the suite itself), plus `endToEnd.test.ts`, which snapshots
`searchAllSources()`'s real, per-source-grouped output for a representative query as a
golden file — the "before" Phase 4's migration must not silently change. 23 new tests,
8 new snapshots, all passing alongside the full existing suite.

## 1. Entry points and control flow

There are exactly two HTTP entry points that pull live job listings, and one page that
renders the first of them.

- `app/sourcing/page.tsx:9-48` — server component. Loads this account's saved
  `JobBoard`/`JobBoardPin` rows for the sidebar panel, then renders the client
  component `JobSearchForm` (not read in depth for this audit; it POSTs to
  `/api/jobs/search` per `tests/e2e/job-search.spec.ts:32`).
- `app/api/jobs/search/route.ts:1-71` — the interactive search endpoint.
- `app/api/raekwon/route.ts:1-89` — a batch "lead report" endpoint that runs the same
  source→dedupe pipeline, then feeds the deduped candidate pool into a separate
  Claude-based ranking step (`lib/raekwon/generateReport.ts`, not audited here since
  it consumes already-normalized `NormalizedJobListing[]`, not source-specific data).
- `app/api/job-boards/[id]/pool/route.ts:19-66` — not a search call, but it does call
  the Greenhouse/Lever fetchers directly (with an empty-string keyword) purely to
  verify a saved board is genuinely queryable before marking it `"live"`.

### Call-path sketch (interactive search)

```
Browser (JobSearchForm)
  │ POST /api/jobs/search { keywords, location?, remoteOnly? }
  ▼
app/api/jobs/search/route.ts
  ├─ requireJsonRequest / requireApiUserId   (auth + content-type guard, lib/security, lib/auth)
  ├─ Promise.all([
  │     searchAllSources(criteria)        ── lib/jobSources/index.ts:34
  │     searchPoolBoards(userId, criteria) ── lib/jobSources/searchPoolBoards.ts:12
  │   ])
  │     searchAllSources:
  │       for each configured static connector (9 of them, CONNECTORS array):
  │         cache.getCachedListings(key, criteria) → hit? return cached
  │                                                 → miss? connector.search(criteria) → cache.setCachedListings(...)
  │     searchPoolBoards:
  │       for each of this user's "live" JobBoardPin rows:
  │         same cache-then-fetch pattern, fetcher = greenhouse or lever
  ├─ per-listing filter: matchesExactTitle && !isSeniorTitle && isUsOrRemoteListing && (remoteOnly ⇒ isRemoteListing)
  │     (lib/jobSources/titleMatch.ts, lib/jobSources/locationFilter.ts)
  ├─ dedupeListings(all surviving listings)  ── lib/jobSources/dedupe.ts:41  (SimHash clustering, DB-backed)
  ├─ re-filter each source group down to the surviving (post-dedupe) ids
  ├─ suggestJobTitles(keywords)  (best-effort Claude call, swallowed on failure)
  ▼
  NextResponse.json({ results, suggestedTitles })
```

`app/api/raekwon/route.ts` follows the identical
`searchAllSources` + `searchPoolBoards` + `dedupeListings` shape (lines 41-45), skipping
the title/location filter step, then hands the deduped pool to
`generateRaekwonReport`.

## 2. Per-source inventory

⚠️ **Scope mismatch, flagged up front (see Open Questions #1):** the task brief describes
"eight current sources" (six HTTP APIs + JobSpy, implicitly ~7-8 counting JobSpy's
boards separately). The repo actually registers **9 static connectors** in
`lib/jobSources/index.ts:15-25`, plus **2 more source *kinds*** (Greenhouse, Lever)
that are dynamic/per-account rather than statically registered. That's 11 distinct
"knows how to fetch a job listing" modules in `lib/jobSources/`, not 8. The table below
covers all of them since this is what actually exists.

| Source (file) | Auth | Base URL / invocation | Pagination | Server-side query filters | Rate limit / quota (as documented in code) | Latency | Retry/timeout | Field mapping |
|---|---|---|---|---|---|---|---|---|
| **usajobs** (`usaJobs.ts`) | `Authorization-Key` header + required `User-Agent` (email), both from env | `GET https://data.usajobs.gov/api/search` | None implemented — single request, no page param sent | `Keyword`, `LocationName`, `RemoteIndicator` | Not documented in code | Not measured | None (bare `fetch`, throws on non-2xx) | `usaJobs.ts:46-58` |
| **adzuna** (`adzuna.ts`) | `app_id` + `app_key` query params, from env | `GET https://api.adzuna.com/v1/api/jobs/us/search/1` — country hardcoded to `"us"` (`adzuna.ts:18`), page hardcoded to `1` in the URL path | Page hardcoded to 1; `results_per_page` fixed at `"20"` (`adzuna.ts:33`) — API supports more pages, none requested | `what` (keywords), `where` (location, optional) | Not documented in code (Adzuna's real-world free tier has a daily call quota; not tracked/enforced anywhere in this repo) | Not measured | None | `adzuna.ts:46-55` |
| **jooble** (`jooble.ts`) | API key in the URL path, from env | `POST https://jooble.org/api/{JOOBLE_API_KEY}` | None — single request | `keywords`, `location` (location backfilled to `"Remote"` when `remoteOnly` is set and no location given — `jooble.ts:33`) | Not documented in code | Not measured | None | `jooble.ts:46-55` |
| **remoteok** (`remoteOk.ts`) | None (public feed) | `GET https://remoteok.com/api` | None — full dump every call; element 0 is a legal/attribution notice, filtered out by the `id && position && url` guard (`remoteOk.ts:41-43`) | None upstream — keyword match done locally against title+company+tags (`remoteOk.ts:44-49`) | Requires a descriptive `User-Agent` or requests are blocked (comment, `remoteOk.ts:28`); no numeric quota documented | Not measured | None | `remoteOk.ts:50-59` |
| **remotive** (`remotive.ts`) | None (public feed) | `GET https://remotive.com/api/remote-jobs` | `limit` param fixed at `"25"` (`remotive.ts:33`); no page/offset used | `search` (keywords) — ⚠️ **live-verified in Phase 1 to not actually filter**: a nonsense keyword returned the identical 35-job set as a real query (`tests/fixtures/remotive/FINDING-search-param-not-filtering.json`) | Comment only: "asks API consumers to stay under ~2 requests/minute" (`remotive.ts:8`) — **not enforced in code**, just a ToS note | Not measured | None | `remotive.ts:41-51` |
| **himalayas** (`himalayas.ts`) | None (public feed) | `GET https://himalayas.app/jobs/api/search` | None — single request | `q` (keywords) only; `location`/`remoteOnly` are **not sent** — comment explains `country` only accepts ISO codes and free text 400s, so the app relies on its own remote-only assumption + `isUsOrRemoteListing` post-filter instead (`himalayas.ts:29-33`). ⚠️ **`q` itself also live-verified in Phase 1 to not reliably filter**: a nonsense keyword returned 19 unrelated real jobs (`tests/fixtures/himalayas/FINDING-search-param-not-filtering.json`) | Not documented in code | Not measured | None | `himalayas.ts:42-51` |
| **jobicy** (`jobicy.ts`) | None (public feed) | `GET https://jobicy.com/api/v2/remote-jobs` | `count` fixed at `"25"` | `tag` (keywords) only; same 400-on-free-text-location situation as Himalayas, documented and worked around the same way (`jobicy.ts:32-36`) | Comment: API "asks for attribution back to Jobicy.com" (`jobicy.ts:4`) — no numeric quota, not enforced in code | Not measured | None | `jobicy.ts:45-54` |
| **arbeitnow** (`arbeitnow.ts`) | None (public feed) | `GET https://www.arbeitnow.com/api/job-board-api` | None — full dump every call, no page param exists upstream per the comment (`arbeitnow.ts:5`) | None upstream — keyword + `remoteOnly` both filtered locally (`arbeitnow.ts:41-45`) | Not documented in code | Not measured | None | `arbeitnow.ts:46-55` |
| **jobspy** (`jobSpy.ts` + `scripts/jobspy_search.py`) | None at the Node layer; whatever `python-jobspy` itself does per site (unauthenticated scraping) | `child_process.spawn(python, ["scripts/jobspy_search.py", ...])` — a Python subprocess, not an HTTP call from Node's perspective (`jobSpy.ts:16-35`) | `results_wanted=25` fixed, one shot, no pagination surfaced to Node (`jobspy_search.py:39`) | `--keywords`, `--location`, `--remote-only` CLI args, forwarded into `scrape_jobs(...)` | None documented; scraped sites' own ToS restricts automated access, called out explicitly as a user-accepted risk, not a rate limit (`jobSpy.ts:42-47`, `jobspy_search.py:5-7`) | Not measured, but this is the connector most likely to be slow — a single subprocess call scrapes 5 sites (indeed, linkedin, zip_recruiter, glassdoor, google) sequentially/internally inside `python-jobspy`, entirely opaque to Node | None — `spawn`'s promise only rejects on non-zero exit or a spawn error; no timeout, no kill after N seconds (`jobSpy.ts:16-35`) | `jobSpy.ts:59-70` |
| **greenhouse:\<token\>** (`greenhouseBoard.ts`) | None (public, per-company) | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | None — full per-company board every call | No native keyword search; title-substring filtered locally (`greenhouseBoard.ts:29-32`) | Not documented in code | Not measured | None | `greenhouseBoard.ts:31-42` |
| **lever:\<token\>** (`leverBoard.ts`) | None (public, per-company) | `GET https://api.lever.co/v0/postings/{token}?mode=json` | None — full per-company board every call | No native keyword search; title-substring filtered locally (`leverBoard.ts:23-26`) | Not documented in code | Not measured | None | `leverBoard.ts:25-36` |

Notes that don't fit the table:
- Greenhouse/Lever are **not** in the static `CONNECTORS` registry at all — they're only
  reachable per-account, driven by `JobBoardPin` rows a user has explicitly pinned and
  verified as `"live"` (`lib/jobSources/searchPoolBoards.ts:12-16`). A given company's
  board is invisible to search until a user pastes its URL in and it's detected +
  verified (`app/api/job-boards/[id]/pool/route.ts`).
- Every static connector's `isConfigured()` is a pure, synchronous, side-effect-free
  check of `process.env` (or `true` for no-key public feeds) — re-evaluated on **every**
  request via `CONNECTORS.filter(...)` in `searchAllSources` (`index.ts:35`), not cached
  at boot.

## 3. Where source-specific knowledge leaks

Per-source knowledge is well-contained in most of the codebase — UI components
(`components/JobBoardPanel.tsx`, `JobSearchForm.tsx`) and `lib/raekwon/generateReport.ts`
were grepped for every source key/name and matched none of them; they operate purely on
the generic `NormalizedJobListing`/`JobSearchResult` shape. The leaks that do exist —
this is the refactor's actual work queue — are:

1. **`lib/jobSources/index.ts:15-25`** — the `CONNECTORS` array. Expected/acceptable
   under the target design (Phase 3 calls this "one registry entry"), but it's worth
   naming as the one place every static source must currently appear.
2. **`lib/jobSources/locationFilter.ts:4,9`** — `REMOTE_ONLY_SOURCES` and
   `ALWAYS_US_SOURCES` are hardcoded `Set`s of source-key strings
   (`"remoteok","remotive","himalayas","jobicy"` / `"adzuna","usajobs"`). This is a
   shared filtering module branching on **source identity**, not a declared capability
   — exactly the anti-pattern the target interface's capability flags
   (`supportsLocationFilter`/`supportsRemoteFilter`, or a per-source "always remote"/
   "always US" declaration) are meant to replace. Adding a 12th remote-only source
   today means editing this file.
3. **`lib/jobSources/searchPoolBoards.ts:26`** —
   `pin.integrationType === "greenhouse" ? fetchGreenhouseBoard : fetchLeverBoard`, a
   conditional branching on a specific source-type string inside shared dynamic-board
   code.
4. **`app/api/job-boards/[id]/pool/route.ts:42`** — the **same**
   `integration.type === "greenhouse" ? fetchGreenhouseBoard : fetchLeverBoard`
   conditional, duplicated independently in a second file.
5. **`lib/jobSources/detectIntegration.ts`** — `BoardIntegration["type"]` is a closed
   union (`"greenhouse" | "lever"`, line 2), and the detection logic itself
   special-cases each platform's hostnames (lines 24-34). This file lives outside both
   `greenhouseBoard.ts` and `leverBoard.ts`, so adding a third ATS (Ashby, per the
   task's own stated future scope) requires editing this file **and** both places in
   #3/#4 above — three edits to shared code for one new source, which is precisely
   what Phase 2's `queryModel: enumerate-board` capability is supposed to collapse into
   a single declarative fact per adapter.

No connector-specific `if (sourceId === 'x')` branches were found inside
`app/api/jobs/search/route.ts` or `app/api/raekwon/route.ts` themselves — both routes
are already source-agnostic at the call-site level. The leaks are all one layer down,
inside `lib/jobSources/`.

## 4. Filtering, ranking, and dedup

- **Exact-title match**: `matchesExactTitle` (`lib/jobSources/titleMatch.ts:12-16`) —
  despite the name, it's a case-insensitive **substring** match of the query phrase
  against the title, not a full-equality match. Applied **after merge**, uniformly
  across every source's listings, inside the route handler
  (`app/api/jobs/search/route.ts:42-51`) — never per-source, never inside a connector.
- A second, unconditional filter rides along in the same `.filter(...)`:
  `isSeniorTitle` (`titleMatch.ts:19-21`) drops anything with "senior"/"Sr." in the
  title, regardless of what the user searched for. This is a fixed product rule, not
  configurable per search.
- **Location/remote filtering**: `isUsOrRemoteListing` / `isRemoteListing`
  (`lib/jobSources/locationFilter.ts`) — also post-merge, also uniform. As noted in
  §3, it hardcodes which source keys get a free pass vs. which get string-sniffed.
- **Dedup**: `dedupeListings` (`lib/jobSources/dedupe.ts`) runs **after** the
  title/location filters, on the already-filtered, already-merged candidate set
  (`app/api/jobs/search/route.ts:56`). It is real, description-text-similarity
  clustering (SimHash + Hamming distance, DB-persisted fingerprints/families,
  configurable threshold via `DEDUP_SIMILARITY_THRESHOLD`) — this is recent,
  already-shipped work in this repo, not the crude exact-key matching the task brief
  describes as "today's" state. See `lib/jobSources/dedupe.ts`,
  `lib/jobSources/simhash.ts`, `lib/jobSources/staffingAgencies.ts`,
  `lib/jobSources/cache.ts`, `lib/jobSources/dedupeConfig.ts` — all already covered by
  unit tests (§8). **This is flagged explicitly in Open Questions #2** since the task
  brief's premise ("dedup is naive today, description similarity is new work to build")
  doesn't match what's actually in the repo.
- No ranking of any kind exists in the search path itself — results are returned
  grouped by source, in whatever order each source's API/local filter produced them.
  (`generateRaekwonReport`, used only by the separate `/api/raekwon` batch endpoint,
  does its own Claude-based ranking over the deduped pool — out of scope here since it
  consumes normalized listings, not source-specific data.)

## 5. Concurrency model

`searchAllSources` (`lib/jobSources/index.ts:34-57`) and `searchPoolBoards`
(`lib/jobSources/searchPoolBoards.ts:12-35`) both use the same shape: `Promise.all` over
a `.map(async (x) => { try { ... } catch { return {...,  error } } })`. The route handler
then does a further `Promise.all([searchAllSources(...), searchPoolBoards(...)])`
(`app/api/jobs/search/route.ts:34-37`).

**What happens when one source 500s or throws**: handled correctly and gracefully — the
per-connector `try/catch` inside the `.map` callback catches it, and that source comes
back as `{ source, label, listings: [], error: "..." }` rather than rejecting. The
overall `Promise.all` still resolves; a broken source degrades that one cell in the
results, not the whole request. This part already matches the target design's failure
envelope in spirit (though not in the literal `{ results, errors, meta }` shape Phase 2
specifies — today the "error" lives inline per-group, there's no top-level `errors[]`
or `meta.degraded`).

**What happens when one source *hangs* (never resolves, never rejects)**: this is
**not** handled. Nothing in this codebase sets a fetch timeout, an `AbortSignal`, or any
other bound on how long a connector's `search()` may run — grepped for `AbortController`
and `signal` across `lib/jobSources/`, found none. Because `Promise.all` only settles
once every one of its promises settles, a single connector that hangs forever (a
stalled TCP connection to a flaky public API, or — most plausibly — a `python-jobspy`
subprocess that never exits) means **the entire `/api/jobs/search` request hangs
forever**, for every source, not just the slow one. This is the single most significant
concurrency-model finding: it's the direct real-world instance of outlier #9
("a source that is flaky or down") and #3 (JobSpy specifically) from the task brief's
own list, and today's code has no circuit breaker, no per-source deadline, and no
partial-timeout escape hatch at all.

No worker pool or queue exists; everything runs as in-process `async`/`await` inside
the Next.js route handler.

## 6. JobSpy integration boundary

- Invocation: `node:child_process.spawn(pythonExecutable, [scriptPath, ...args])`
  (`lib/jobSources/jobSpy.ts:16-35`) — a single subprocess spawned fresh per search, not
  a long-lived sidecar or queue. `pythonExecutable` defaults to the string `"python"`,
  overridable via `JOBSPY_PYTHON` env var.
- The script (`scripts/jobspy_search.py`) makes **one** call to `python-jobspy`'s
  `scrape_jobs(site_name=["indeed","linkedin","zip_recruiter","glassdoor","google"], ...)`
  covering all 5 sites in a single library call — there is no Node-visible concept of
  "site 3 of 5 failed but the others succeeded." Whether `python-jobspy` itself does
  partial-failure-tolerant scraping internally (and if so, whether that surfaces in its
  return value) is **not verifiable from this repo** — it's inside a third-party
  Python package not vendored here. Flagged in Open Questions #3.
- Error surfacing: stdout is buffered and JSON-parsed only after the process exits 0;
  stderr is buffered and, on a non-zero exit code, thrown as
  `Error(\`jobspy_search.py exited ${code}: ${stderr.trim()}\`)`
  (`jobSpy.ts:27-29`). This is all-or-nothing — either the whole subprocess's output
  parses as one JSON array, or the whole connector call fails and every site's results
  for that search are lost, not just the one(s) that errored.
- ~~Timeout: none, as covered in §5~~ **Fixed 2026-07-29**: `spawn()` now takes
  `signal: AbortSignal.timeout(getJobSpyTimeoutMs())` (default 90s,
  `lib/jobSources/timeoutConfig.ts`), and every HTTP-based connector's `fetch()` call
  got the same treatment via `getSourceFetchTimeoutMs()` (default 15s). See
  `docs/decisions.md`. This closes the "entire search hangs forever" risk from §5 —
  a timed-out connector now rejects like any other per-source failure, isolated by the
  existing try/catch in `index.ts`/`searchPoolBoards.ts`.
- ~~Discrepancy found: stale `JOBSPY_ENABLED` docstring~~ **Resolved 2026-07-29**:
  confirmed with the user that JobSpy is intentionally always-on, not opt-in. The stale
  docstring line in `jobspy_search.py` describing a `JOBSPY_ENABLED` gate that no code
  ever read has been removed. Former Open Questions #4, closed.

## 7. Config and secrets

- Every credential is read directly via `process.env.X` at the point of use inside each
  connector — `adzuna.ts:25,30-31`, `usaJobs.ts:25,36-37`, `jooble.ts:26,35`,
  `jobSpy.ts:18`. There is no central env/config module, no schema validation (e.g. no
  zod parse of `process.env` despite `zod` already being a project dependency used
  elsewhere), and no `instrumentation.ts` (none exists in the repo) or other boot hook
  that validates configuration before the server starts accepting requests.
- **What happens on boot if a key is absent**: nothing — the app starts normally
  regardless. Each connector's own `isConfigured()` is re-evaluated per-request inside
  `searchAllSources`'s filter (`index.ts:35`) and an unconfigured connector is silently
  excluded from that request's `configured` list. There is no boot-time warning, no
  startup log line, and no way for an operator to discover "Adzuna is misconfigured"
  short of noticing it never appears in results.
- `.env.example` documents every var with an inline comment (including the two newest,
  `DEDUP_SIMILARITY_THRESHOLD` / `JOB_CACHE_TTL_MINUTES` — not job-source credentials,
  but part of this same pipeline) — this is the closest thing to configuration
  documentation that exists; it's a plain-text template, not enforced anywhere in code.

## 8. Test and observability baseline

**Tests that exist** (`tests/unit/jobSources/`):
`titleMatch.test.ts`, `locationFilter.test.ts`, `detectIntegration.test.ts`,
`dedupe.test.ts`, `cache.test.ts`, `simhash.test.ts`, `staffingAgencies.test.ts` — seven
files, all covering the **pure-logic/shared helper** modules (filtering, dedup
clustering, caching, ATS-URL detection). None of them touch a real or mocked HTTP
response from any of the 9 static connectors or the 2 ATS board fetchers.

**What does not exist**: there is no unit test anywhere in the repo that exercises
`adzuna.ts`, `remoteOk.ts`, `remotive.ts`, `himalayas.ts`, `jobicy.ts`, `arbeitnow.ts`,
`jooble.ts`, `usaJobs.ts`, `jobSpy.ts`, `greenhouseBoard.ts`, or `leverBoard.ts` — no
fixture files, no `nock`/`msw`/mocked `fetch`, nothing. Every one of these connector
modules' request-building and response-mapping logic is currently unverified by any
automated test. This is the central gap Phase 1 (fixtures + characterization tests) is
designed to close, and it means **today there is no safety net at all for the exact
code this refactor is about to move** — Phase 1 isn't optional groundwork, it's the
only thing standing between this refactor and flying blind.

`tests/e2e/job-search.spec.ts` mocks the entire `/api/jobs/search` HTTP response at the
Playwright network layer (`page.route("**/api/jobs/search", ...)`, lines 32-48) — it
verifies frontend rendering/pagination, and never invokes `searchAllSources`, the
filters, or dedupe at all.

No test in the repo ever makes a real call to an external job-search API or spawns the
real JobSpy subprocess — consistent with this project's established
no-live-external-calls testing convention.

**Observability**: grepped `lib/jobSources/` for `console.`, `logger`, `correlationId`,
`traceId`, and `X-Request-Id` — zero matches. There is no structured logging, no
per-source timing, no result-count logging, no request tracing/correlation ID, and no
quota-consumption tracking anywhere in this part of the codebase. The only signal that
survives a failed source today is a raw `err.message` string attached to that source's
result group (`index.ts:47-53`, `searchPoolBoards.ts:30-32`) — useful as raw material,
but it's an untyped string, not a `{ kind, retryable }` classification.

## 9. Runtime facts

- **Node**: v20 in CI (`.github/workflows/ci.yml:11-13`, `actions/setup-node@v4`,
  `node-version: 20`). No `engines` field in `package.json` pinning this locally.
- **Module system**: CJS by default — no `"type": "module"` in `package.json`. Next.js/
  Turbopack handles the app's own bundling regardless; this matters for any Node-only
  script that runs outside the Next.js pipeline (Playwright test files in this repo are
  known, from prior work in this codebase, to transpile to CJS and reject
  `import.meta.url`).
- **TypeScript**: strict mode, `target: "ES2017"` (`tsconfig.json:3`) — a
  previously-established constraint in this repo is that this rules out native BigInt
  literal syntax (`123n`) project-wide.
- **Framework**: Next.js `16.2.11`, App Router (`app/` directory), React 19.2.4.
  `next dev`/`next start` are both run with `-H 127.0.0.1` (`package.json:7-8`) — bound
  to loopback only, not `0.0.0.0`.
- **Package manager**: npm (`npm ci` + `cache: npm` in CI; no `pnpm-lock.yaml` or
  `yarn.lock` present).
- **Lint**: ESLint 9, flat config, `eslint-config-next`'s `core-web-vitals` +
  `typescript` presets (`eslint.config.mjs`). No custom rule exists today that would
  enforce "core code may never import a specific adapter" — Phase 3's proposed lint
  rule/grep-test would be entirely new, not an extension of something already in place.
- **CI** (`.github/workflows/ci.yml`): one workflow, runs on every push and PR —
  `npm ci` → `npx prisma generate` → `npm run lint` → `npx tsc --noEmit` →
  `npm run test:unit` (Vitest) → install Playwright Chromium → `npm run test:e2e`.
  **Inconsistency worth flagging**: CI never runs `next build` — a production-build-only
  failure (e.g. a bad Server/Client Component boundary) would not be caught by this
  pipeline today, only `tsc --noEmit` and lint. Adjacent to this task, not caused by it,
  but relevant if the refactor introduces new module boundaries.
- **AGENTS.md** (`AGENTS.md`, pulled in via `CLAUDE.md`'s `@AGENTS.md`) instructs reading
  `node_modules/next/dist/docs/` before writing Next.js code, since this app pins a
  Next.js version newer than most training data. Noted here only because Phase 1+ will
  involve writing code against this same Next.js version.

## Open Questions

1. **Source count mismatch**: the task brief frames this as an 8-source system
   (6 HTTP APIs + JobSpy, roughly). The repo has 9 statically-registered connectors
   plus 2 dynamic per-account ATS integrations (11 total "knows how to fetch listings"
   modules), and 3 of the 9 static ones (`usajobs`, `jooble`, and the Greenhouse/Lever
   pair) aren't mentioned in the brief at all. Should the migration plan (Phase 4)
   treat all 11 as in-scope, or is there a reason to exclude some (e.g. USAJobs/Jooble
   being lower-priority, or the ATS pair being handled entirely by the "implement one
   brand-new source" validation exercise rather than a migration)?
2. **Dedup premise mismatch — partially resolved 2026-07-29.** The brief describes
   today's dedup as naive exact-match; it's actually already SimHash-based clustering
   with caching, fully tested (`lib/jobSources/dedupe.ts`, `simhash.ts`, `cache.ts`,
   `dedupeConfig.ts`). Confirmed with the user: **not** treated as finished-and-frozen —
   it should be revisited for optimization once the adapter interface's provenance
   fields exist (Phase 2's `sourceKind`/`posterIsLikelyAgency`), since dedupe currently
   re-derives its own agency-vs-direct-employer signal via
   `isStaffingAgency(company)` rather than consuming a per-adapter-declared fact. See
   `docs/decisions.md` for the specifics. Still open: this is Phase 2 design input, not
   yet a concrete task — no dedupe.ts code has changed.
3. **JobSpy per-board partial failure**: cannot verify from this repo alone whether
   `python-jobspy`'s `scrape_jobs()` call already tolerates one site failing while
   returning results from the others, or whether a single site's error kills the whole
   call. This determines whether "JobSpy reports per-board partial failure" (an
   explicit Phase 2 requirement) needs new logic in `jobspy_search.py`, a change to how
   `python-jobspy` is called (e.g. one subprocess call per site instead of one call for
   all five), or is already free. Needs a live check or a look at the
   `python-jobspy` package source — deliberately not done in this audit.
4. ~~Stale/aspirational `JOBSPY_ENABLED` docstring~~ **Resolved 2026-07-29** — confirmed
   JobSpy is intentionally always-on, not opt-in; the stale docstring line was removed
   (`docs/decisions.md`). The adapter interface's future `configSchema`/`isConfigured`
   for this connector (Phase 2) should reflect "always configured, no opt-in flag,"
   not add one.
5. **Rate limiting / quota accounting is entirely absent today.** No connector tracks
   calls-per-day, calls-per-minute, or any cost/quota unit anywhere in this repo — the
   `cost`/`latencyClass`/`maxConcurrency` capability flags Phase 2 proposes have no
   existing analog to migrate from; they'd be new declarations based on each source's
   external docs/ToS, not derived from current code. Flagging so Phase 2 doesn't assume
   there's existing tracking logic to preserve.
6. ~~No timeout/circuit-breaker exists anywhere in the current pipeline~~ **Timeout
   fixed 2026-07-29** — every connector now aborts past a configurable deadline
   (`lib/jobSources/timeoutConfig.ts`; see `docs/decisions.md`), so a hung source
   rejects instead of hanging the whole request forever. **Still open**: this is a
   timeout, not a full circuit breaker — a source that's consistently slow/down still
   pays its full timeout cost on every single search rather than being short-circuited
   after N consecutive failures. Phase 3's actual circuit-breaker proposal remains
   future work; today's fix only bounds the damage per-request, it doesn't learn across
   requests.
