# Adding a job source

This is the payoff of the whole refactor (`docs/architecture-audit.md`,
`docs/adapter-interface.md`, `docs/decisions.md`): a new source is one directory, one
registry entry, one fixture set, and zero edits to shared code. If any step below
turns out to need touching a file outside the new source's own directory (other than
the one registry line), that's the interface failing, not you — stop and propose an
interface amendment (see `docs/decisions.md` for how past ones were handled), don't
special-case shared code.

Concretely proved by this refactor's own history: Greenhouse and Lever were both
migrated as `queryModel: "enumerate-target"` adapters using this exact checklist.
Registering Lever required editing precisely one line (its own registry import +
array entry) — zero further changes to `search.ts`, the pool-board wiring, or anything
else, which is the confirming evidence this checklist actually holds.

## Checklist

1. **Create `lib/jobAdapters/adapters/<name>/index.ts`.** Export one `Adapter<TRaw>`
   object implementing:
   - `metadata` — `id` (lowercase, matches the registry key), `displayName`,
     `homepage`, `tosNotes` (real ToS/robots constraints, attribution asks, scraping
     risk — whatever's actually true), `sourceKind`.
   - `capabilities` — see `lib/jobAdapters/types.ts` for the current contract,
     `docs/adapter-interface.md` 2c for rationale, and existing
     `lib/jobAdapters/adapters/*/index.ts` implementations for examples.
     Get `queryModel` right: `"keyword-search"` only if you've actually verified the
     source filters server-side (a nonsense keyword should return zero/different
     results — don't just trust the docs, see the Remotive/Himalayas findings in
     `docs/architecture-audit.md`), `"full-dump"` if it always returns everything,
     `"enumerate-target"` if querying it means "give me everything for this one
     company/board/URL," never "search by keyword."
   - `configSchema` — declare every required env var here, even if `isConfigured()`
     also checks it directly (config.ts cross-checks both).
   - `isConfigured()` — cheap, synchronous, never throws.
   - `healthCheck(ctx)` — a cheap real check (a tiny request with `maxRetries: 0`), not
     a full search. If a full search is the only meaningful check (e.g. no lightweight
     endpoint exists), say so in a comment and use `isConfigured()`'s truthiness as the
     signal instead of paying the full cost, the way `jobspy/index.ts` does.
   - `search(query, ctx)` — an async generator. Use
     `lib/jobAdapters/services/httpClient.ts`'s `fetchWithRetry(url, options, ctx)`,
     not raw `fetch`, so you get the timeout/retry/backoff every other adapter gets
     for free. Don't add a local keyword filter if `supportsKeywordQuery` is `false` —
     `lib/jobAdapters/search.ts` and the app's own post-fetch filter already re-check
     every source's listings uniformly regardless of source, so a local filter there
     is redundant, not protective.
     For queued subprocess work, defer timing access with
     `getSignal: () => ctx.signal` when using `scheduleScrape`; its `run(signal)`
     callback receives the execution signal after dequeue. Reading `ctx.signal`,
     `ctx.deadline`, or spreading the context before enqueue starts the timer too
     early. Preserve local errors instead of converting them into board-failure
     responses; wait for a killed subprocess to close before releasing the queue.
     Pin dependencies when wrapping private APIs and validate those hooks before
     network access. See [JobSpy request controls](jobspy-request-controls.md).
   - `normalize(rawItem, ctx)` — pure, no network, no `ctx.cache`/`ctx.rateLimiter`
     access. Missing data is `null`, never a guessed or invented value (see
     `docs/adapter-interface.md` 2a's rules). If this is an `enumerate-target` adapter,
     `ctx.query` carries the target (`ctx.query.kind === "target" ? ctx.query.target :
     ...`) — you need it to build a correct `sourceId`/`company` (see
     `greenhouse/index.ts`).
   - `detectTarget(url)` — **only** for `enumerate-target` adapters. Recognizes this
     platform's URL shapes and extracts a token; returns `null` for anything else.
     This is what lets `app/api/job-boards/[id]/pool/route.ts` recognize a pinned
     board without a shared, growing if/else chain.

2. **Register it.** One import + one array entry in `lib/jobAdapters/registry.ts`.
   Nothing else in this file, or anywhere else, should need to change.

3. **Capture real fixtures** under `tests/fixtures/<name>/`: a typical result, an
   empty result (a real query that legitimately returns nothing — not a fabricated
   one), and an error/rate-limited response, following the envelope shape used by the
   existing sources (`{ status, capturedAt, note, body }`, see
   `tests/fixtures/loadFixture.ts`). If a fixture genuinely can't be captured (source
   unreachable, not configured, an install blocker) — record that honestly in a
   metadata-only file (see `tests/fixtures/jobspy/BLOCKED.json`,
   `tests/fixtures/usajobs/UNCONFIGURED.json` for the pattern) rather than skip
   silently or fabricate one.

4. **Write contract tests** using `lib/jobAdapters/testing/contractSuite.ts`'s
   `runAdapterContractSuite(adapter)` — one call, and every required assertion
   (capability consistency, schema validation, normalize purity, empty results, typed
   errors, abort-signal termination, no global-state writes, config-absence handling)
   runs automatically. Add source-specific fixture-replay tests on top if you want
   deeper coverage of real captured shapes (MSW — `tests/setup/mswServer.ts` — is the
   HTTP-interception layer already in place for this).

5. **Verify**: `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`,
   `npm run test:e2e`, all green.

That's it — no `ADAPTER_MODE` flag to flip, no dual-mode diffing to check, no legacy
path to keep in sync. Those existed only during the Phase 4/5 migration
(`docs/decisions.md`) and are gone now that every source has moved.
