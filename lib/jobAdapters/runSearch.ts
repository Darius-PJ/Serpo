// Orchestration entrypoint implementing the { results, errors, meta } envelope
// (docs/adapter-interface.md 2e). NOT wired into any real HTTP route yet — that's
// Phase 4, behind ADAPTER_MODE. This file only ever imports registry.ts, never a
// concrete adapter, and is itself "core" for the purposes of
// tests/unit/jobAdapters/noAdapterImportsOutsideRegistry.test.ts.
import { createAdapterContext } from "./context";
import { RateLimitExceededError } from "./services/rateLimiter";
import type { Adapter, JobSearchResultGroup, NormalizedJobListing, NormalizedQuery, SearchEnvelope, SearchError } from "./types";

const RETRYABLE_BY_KIND: Record<SearchError["kind"], boolean> = {
  timeout: true,
  "http-error": true,
  "parse-error": false,
  "circuit-open": true,
  unconfigured: false,
  aborted: false,
  unknown: true,
};

function classifyError(err: unknown): SearchError["kind"] {
  if (err instanceof RateLimitExceededError) return "circuit-open";
  if (err instanceof SyntaxError) return "parse-error";
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return "timeout";
    if (err.name === "AbortError") return "aborted";
    if (/^(retryable )?HTTP \d/.test(err.message)) return "http-error";
  }
  return "unknown";
}

async function collectListings(adapter: Adapter, query: NormalizedQuery, ctx: ReturnType<typeof createAdapterContext>): Promise<NormalizedJobListing[]> {
  const cached = await ctx.cache.get(query);
  if (cached) return cached;

  await ctx.rateLimiter.acquire();
  const fetchedAt = new Date().toISOString();
  const listings: NormalizedJobListing[] = [];
  for await (const page of adapter.search(query, ctx)) {
    for (const rawItem of page.items) {
      listings.push(adapter.normalize(rawItem, { fetchedAt }));
    }
  }
  await ctx.cache.set(query, listings);
  return listings;
}

export async function runAdapterSearch(query: NormalizedQuery, adapters: Adapter[], correlationId: string): Promise<SearchEnvelope> {
  const results: JobSearchResultGroup[] = [];
  const errors: SearchError[] = [];
  const perSourceTiming: SearchEnvelope["meta"]["perSourceTiming"] = {};

  await Promise.all(
    adapters.map(async (adapter) => {
      const sourceId = adapter.metadata.id;
      const startedAt = new Date();
      const ctx = createAdapterContext(adapter, correlationId);

      try {
        if (ctx.circuitBreaker.isOpen()) {
          throw Object.assign(new Error(`${sourceId}: circuit breaker open`), { name: "CircuitOpenError" });
        }

        const listings = await collectListings(adapter, query, ctx);
        ctx.circuitBreaker.recordSuccess();
        results.push({ source: sourceId, label: adapter.metadata.displayName, listings });
        ctx.logger.info("search completed", { resultCount: listings.length });
      } catch (err) {
        const kind = err instanceof Error && err.name === "CircuitOpenError" ? "circuit-open" : classifyError(err);
        if (kind !== "circuit-open") ctx.circuitBreaker.recordFailure();
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ sourceId, kind, message, retryable: RETRYABLE_BY_KIND[kind] });
        results.push({ source: sourceId, label: adapter.metadata.displayName, listings: [] });
        ctx.logger.error("search failed", { kind, message });
      } finally {
        perSourceTiming[sourceId] = { startedAt: startedAt.toISOString(), durationMs: Date.now() - startedAt.getTime() };
      }
    })
  );

  return { results, errors, meta: { perSourceTiming, degraded: errors.length > 0 } };
}
