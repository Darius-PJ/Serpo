# Decision log

Non-obvious choices made during the job-source adapter refactor, and why. Newest first.

## 2026-07-29 — Phase 4: all 11 sources migrated, no tests/checks (explicit instruction)

Per explicit user instruction ("Proceed to Phase 4 with no tests or checks"), this
entire migration pass skipped fixtures, contract tests, and verification commands
(lint/tsc/unit/e2e) — a deliberate deviation from the task's own "each commit includes
the adapter, its fixtures, its passing contract tests, and a green characterization
suite" definition of done for this phase. Every commit message says so individually;
noted once more here since it's the single biggest risk carried out of this phase.

All 11 source modules from `docs/architecture-audit.md`'s inventory now have a
`lib/jobAdapters/adapters/` entry, wired behind `ADAPTER_MODE` (default `"legacy"` —
today's behavior is unchanged unless someone opts in). One git-hygiene mistake
happened along the way: `git add lib/jobAdapters/` swept the not-yet-registered Adzuna
adapter file into the RemoteOK commit. Not fixed by rewriting history — registering
Adzuna (the part that actually makes a migration "real") landed in its own following
commit instead.

Two genuine interface findings surfaced by actually building all 11, both reported
loudly rather than silently patched, per the task's own rule:

1. **`createAdapterContext` ignored `latencyClass` entirely** (found while migrating
   JobSpy) — every adapter got the same 15s timeout regardless of what it declared,
   which would have killed JobSpy's subprocess mid-scrape. Fixed by deriving the
   timeout from `latencyClass` (`"very-slow"` reuses the already-proven
   `JOBSPY_TIMEOUT_MS`). A Phase 3 implementation gap, not a Phase 2 design flaw.
2. **`NormalizeContext` had no way to carry which target/board produced a listing**
   (found while migrating Greenhouse, the task's own "new source" validation
   exercise) — an `enumerate-target` adapter needs its query's `target` to build a
   correct `sourceId`/`company` (e.g. `"greenhouse:<token>"`). Fixed generically by
   adding a `query` field to `NormalizeContext`, plumbed through `runSearch.ts`. Lever,
   migrated immediately after using the same fix with zero further core changes,
   is the confirming data point that this was genuinely generic and not
   Greenhouse-specific.

Both fixes touched shared code (`context.ts`, `types.ts`, `runSearch.ts`) — outside the
adapter's own directory, which the task says to report rather than paper over. Neither
was a `sourceId === "x"` branch; both were capability/interface-shape gaps that
benefit every adapter, not just the one that exposed them.

## 2026-07-29 — Phase 1: MSW for interception, live-call scope decisions, and what got skipped

**HTTP interception library**: proposed MSW / nock / Polly.js to the user with a
recommendation; **MSW** was chosen. Every connector in `lib/jobSources/` calls native
`fetch()` directly (no axios, no `node:http`) — MSW's interceptor engine
(`@mswjs/interceptors`) has first-class native-fetch/undici support, which is
historically the weaker part of nock (built around `http.ClientRequest` first).
Polly.js was ruled out for pushing toward automatic VCR-style cassette recording,
whereas this phase wanted a small number of hand-reviewed, redacted fixture files per
source, plus it has slowed in maintenance.

**Live fixture capture actually happened this phase** — a deliberate exception to this
project's usual "no live API calls during iterative work" convention, because Phase 1's
entire purpose is capturing real responses; the user's "proceed with the fix noted in
Phase 1" instruction was treated as authorization for that specific, bounded activity
(≤3 requests per reachable source), not a general lifting of the convention.

**JobSpy fixture capture was attempted, not silently skipped, and ultimately still
skipped**: the user explicitly chose "install python-jobspy now and capture live
scrapes" over skipping it outright. The install failed — `python-jobspy` hard-pins
`numpy==1.26.3`, which has no prebuilt wheel for this machine's Python 3.13 and needs a
C/C++ compiler (MSVC/gcc/clang) to build from source, none of which is installed.
Installing a full build toolchain was judged a materially bigger, more invasive ask
than what was approved (installing one pip package), so it was not attempted without
separately asking — instead recorded honestly in `tests/fixtures/jobspy/BLOCKED.json`
and reported back. Unblocking this later needs either a different Python install
(3.11/3.12, which may have prebuilt numpy 1.26.3 wheels) or a C/C++ toolchain.

**Mislabeled "error" fixtures were caught and fixed, not shipped**: two live "error"
capture attempts (RemoteOK's User-Agent block, Arbeitnow's wrong-path 404) both
actually returned 200 with real data instead of the expected error. Rather than keep
files named `error.json` containing a non-error response — which would have silently
misled Phase 4's contract tests later — both were deleted and replaced with
`error-not-reproduced.json` files documenting exactly what was tried and what actually
happened. Two more genuine, unexpected findings surfaced this way: Remotive's `search`
param and Himalayas' `q` param both turned out not to reliably filter server-side (a
nonsense keyword returned real, unrelated jobs in both cases) — documented as
`FINDING-*.json` files and folded back into `docs/architecture-audit.md`'s per-source
table (marked ⚠️, not silently corrected) since they contradict what that audit
originally assumed from reading the connector code alone.

**Large fixtures were trimmed, not committed at full size**: Greenhouse's real Stripe
board (533 jobs, 4.2MB) and several others were trimmed down to 5-6 items each after
capture. Every kept item is untouched/real; only the array length changed, and each
trim is disclosed via a `truncatedFrom`/`truncationNote` field in the fixture itself —
re-verified after trimming that the "derived empty" claims (filtering the real dump by
a nonsense keyword yields zero matches) still held on the trimmed data before relying
on them in tests.

**Golden end-to-end snapshot test explicitly stubs its own environment** rather than
inheriting `.env.local` — `ADZUNA_APP_ID`/`KEY` are set to fixed test values,
`USAJOBS_*`/`JOOBLE_API_KEY` are explicitly deleted, and `JOBSPY_PYTHON` is pointed at a
deliberately nonexistent binary so the JobSpy connector fails fast and deterministically
(ENOENT) regardless of whether `python-jobspy` happens to be installed on whatever
machine runs this test later. This makes `tests/unit/jobSources/characterization/endToEnd.test.ts`
fully portable/CI-safe instead of silently depending on this specific developer
machine's configured API keys.

## 2026-07-29 — Phase 3 built without Phase 1's real fixtures; flagged, not silently skipped

**Context**: the task's own phase ordering puts Phase 1 (real recorded fixtures +
characterization golden files for the legacy path) before Phase 3 (core + contract
test suite), and Phase 3's contract suite is specified to run "from fixtures only."
Phase 1 was never done in this project — the user directed straight from Phase 0 to
Phase 2 to Phase 3.

**Decision**: proceeded with Phase 3 anyway, because its actual deliverables (registry,
config validation, shared services, the contract-suite *machinery*) don't depend on
real per-source fixtures — they can be proven correct against small, clearly-labeled
reference adapters (`lib/jobAdapters/testing/fixtureAdapters.ts`) built for exactly this
purpose. What genuinely can't happen without Phase 1: migrating any of the 11 real
sources in Phase 4 and trusting that their behavior didn't silently change. That
dependency was **not** removed, only deferred — flagged again here and in
`docs/architecture-audit.md` so it isn't lost. Recommend real fixture capture happens
before Phase 4 starts moving a real source's traffic, even though Phase 3 didn't need
it.

**Design choices inside Phase 3**, briefly:
- `queryModel: "enumerate-target"` (not the brief's separate "enumerate-board") unifies
  outliers #4 (Greenhouse/Lever/Ashby) and #5 (JSON-LD crawl) — both are "give me
  everything at this target, no keyword search," differing only in whether the target
  is a recognized platform token or an arbitrary URL. Proposed in
  `docs/adapter-interface.md` 2b/2d, implemented as-is in `lib/jobAdapters/types.ts`.
- `detectTarget(url)` lives on each `enumerate-target` adapter itself, replacing the
  legacy `detectIntegration.ts`'s closed `"greenhouse" | "lever"` union and the two
  duplicated fetcher-selection conditionals in `searchPoolBoards.ts` and
  `app/api/job-boards/[id]/pool/route.ts` (audit §3, items 3-5). Not migrated yet —
  legacy code is untouched — but the new interface is ready for it.
- `lib/jobSources/cache.ts`'s `getCachedListings`/`setCachedListings` were made generic
  (`<T = NormalizedJobListing>`) rather than duplicated, so the new adapter cache
  service (`lib/jobAdapters/services/cache.ts`) reuses the same table/TTL logic for the
  richer record shape. Default type parameter means every existing legacy call site is
  unchanged and untyped differently.
- No new dependency was added for structured logging or schema validation — `zod`
  (already a dependency) validates `NormalizedJobListing`; the logger is a ~20-line
  JSON-line emitter, matching the standing "no new dependencies without asking" rule.
- Rate limiter and circuit breaker are in-memory (`Map`-keyed by sourceId), matching
  this app's existing single-instance, local-first architecture — no new
  infrastructure (Redis, etc.) introduced.
- `instrumentation.ts` was added to call `logConfigWarnings()` once at boot. It's a
  genuine, real hook — not a placeholder — but harmless today since
  `lib/jobAdapters/registry.ts`'s `ADAPTERS` array is still empty.
- Nothing in `lib/jobAdapters/` is imported by any real route yet. `app/api/jobs/search/route.ts`
  and the legacy `lib/jobSources/` tree are completely untouched — wiring in
  `ADAPTER_MODE` and dual-mode diffing is explicitly Phase 4 scope per the task brief.

## 2026-07-29 — Per-source timeout via `AbortSignal.timeout()`, not a custom wrapper

**Context**: `docs/architecture-audit.md` §5 found that no job-source connector had a
fetch timeout or `AbortSignal` anywhere. Since `searchAllSources`/`searchPoolBoards`
use `Promise.all`, which only settles once every connector settles, a single hung
connector (most plausibly the JobSpy subprocess, or any flaky public API) hangs the
*entire* search request forever, for every source — not just the slow one.

**Decision**: give every connector's `fetch()` call a `signal: AbortSignal.timeout(getSourceFetchTimeoutMs())`
(default 15s, `lib/jobSources/timeoutConfig.ts`), and give JobSpy's `spawn()` call a
longer `signal: AbortSignal.timeout(getJobSpyTimeoutMs())` (default 90s, since it
scrapes five sites in one subprocess call). Both are configurable via env vars
(`JOB_SOURCE_TIMEOUT_MS`, `JOBSPY_TIMEOUT_MS`), following the same
"value with a sane default, documented in `.env.example`" convention already
established by `dedupeConfig.ts`.

**Alternatives considered**:
- A hand-rolled `Promise.race([fetchPromise, timeoutPromise])` wrapper — rejected as
  more code for no behavioral difference; `AbortSignal.timeout()` (Node 17.3+, well
  within this project's Node 20 baseline) does the same thing natively and, critically,
  actually cancels the in-flight request/process rather than just abandoning it, so a
  timed-out connector doesn't keep the underlying socket or subprocess alive after its
  result is discarded.
- A single shared timeout constant for both HTTP connectors and JobSpy — rejected
  because JobSpy is structurally different (a multi-site scrape via subprocess, not a
  single JSON API call) and audit §2 already flagged its latency as unmeasured but
  likely much higher; a single value would either be too tight for JobSpy or too loose
  for every other source.

**Why this doesn't require touching the connector interface**: the existing
per-connector `try/catch` in `lib/jobSources/index.ts` and `searchPoolBoards.ts`
already isolates a rejecting connector to just that one source's result group
(`{ source, label, listings: [], error }`). A timeout just converts "hangs forever"
into "rejects after N seconds" — it doesn't need a new error-envelope shape, capability
flag, or interface change. That's Phase 2/3 work if/when this becomes an adapter with a
declared `latencyClass`/circuit breaker; this fix stands on its own and doesn't
foreclose that.

## 2026-07-29 — Removed the stale `JOBSPY_ENABLED` docstring claim

**Context**: `scripts/jobspy_search.py`'s docstring claimed the script "Only runs when
JOBSPY_ENABLED=true is set," but no code anywhere in the repo ever read that variable —
`jobSpy.ts`'s `isConfigured()` has unconditionally returned `true` since it was written,
per an explicit comment there ("Always on, per explicit user direction"). Confirmed
with the user: JobSpy is intentionally always-on, not opt-in: the stale line was
removed rather than implementing the gate it described.

## Open — dedup revisit deferred, not resolved

The user confirmed `lib/jobSources/dedupe.ts`'s SimHash-based clustering (already
shipped, see prior session) should be **revisited for optimization once the adapter
interface's provenance fields land** (Phase 2's `sourceKind`/`posterIsLikelyAgency`),
rather than treated as finished. No code changed for this yet — flagged here so it
isn't lost, and carried in `docs/architecture-audit.md`'s Open Questions as #2. The
likely shape of that optimization: `dedupe.ts` currently re-derives
`isStaffingAgency(listing.company)` from a name heuristic on every call
(`lib/jobSources/staffingAgencies.ts`); once each adapter's `normalize()` populates a
declared `posterIsLikelyAgency` field directly, dedupe could consume that instead of
recomputing it, and per-adapter `sourceKind` (`direct-employer | ats | aggregator | scraped-board`)
could replace the heuristic entirely for adapters that already know their own kind
(e.g. a Greenhouse/Lever adapter is definitionally `ats`, never agency-scraped). Not
implemented now because the provenance fields don't exist yet — this is Phase 2 design
input, not a standalone task.
