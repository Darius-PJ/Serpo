import { afterEach, describe, expect, it, vi } from "vitest";
import { runAdapterSearch } from "@/lib/jobAdapters/runSearch";
import { keywordAdapter } from "@/lib/jobAdapters/testing/fixtureAdapters";
import { resetCircuitBreakerStateForTests } from "@/lib/jobAdapters/services/circuitBreaker";
import { resetRateLimiterStateForTests } from "@/lib/jobAdapters/services/rateLimiter";
import type { Adapter } from "@/lib/jobAdapters/types";
import { createAdapterContext } from "@/lib/jobAdapters/context";
import { prisma } from "@/lib/db/prisma";

function withId(id: string): Adapter {
  return { ...keywordAdapter, metadata: { ...keywordAdapter.metadata, id }, capabilities: { ...keywordAdapter.capabilities, cacheable: false } };
}

afterEach(() => {
  resetCircuitBreakerStateForTests();
  resetRateLimiterStateForTests();
});

describe("runAdapterSearch", () => {
  it("preserves successful boards and stale listings when a subprocess fails", async () => {
    const query = { kind: "keywords" as const, keywords: "engineer", location: null, remoteOnly: false };
    const good = withId("independent-good");
    const failing: Adapter = { ...withId("independent-failing"), capabilities: { ...good.capabilities, runtime: "subprocess", cacheable: true },
      async *search() { throw Object.assign(new Error("Google blocked this request"), { details: "HTTP 429 /sorry/index" }); yield { items: [], partial: false, nextCursor: null }; } };
    const context = createAdapterContext(failing, "seed");
    const old = good.normalize({ id: "cached-job", title: "Cached engineer", url: "https://example.com/old" }, { query, fetchedAt: new Date().toISOString() });
    await context.cache.set(query, [old]);
    const fetchedAt = new Date(Date.now() - 60 * 60_000);
    await prisma.jobSourceCache.updateMany({ where: { source: failing.metadata.id }, data: { fetchedAt } });
    const result = await runAdapterSearch(query, [good, failing], "separate");
    expect(result.results[0].listings.length).toBeGreaterThan(0);
    expect(result.results[1].listings).toHaveLength(1);
    expect(result.errors[0].message).toContain(`Showing cached results from ${fetchedAt.toISOString()}`);
    expect(result.errors[0].details).toBe("HTTP 429 /sorry/index");
  });

  it("shows partial results with their warning without caching them as a success", async () => {
    const base = withId("partial-board");
    const adapter: Adapter = { ...base, capabilities: { ...base.capabilities, cacheable: true },
      async *search(query, ctx) {
        for await (const page of base.search(query, ctx)) yield { ...page, partial: true, warning: "Page two was blocked", details: "HTTP 403" };
      } };
    const result = await runAdapterSearch({ kind: "keywords", keywords: "engineer", location: null, remoteOnly: false }, [adapter], "partial");
    expect(result.results[0].listings.length).toBeGreaterThan(0);
    expect(result.results[0].warning).toBe("Page two was blocked");
    expect(result.meta.degraded).toBe(true);
    expect(await prisma.jobSourceCache.count({ where: { source: "partial-board" } })).toBe(0);
  });
  it("returns a populated result group and no errors on the happy path", async () => {
    const adapter = withId("run-search-happy");
    const envelope = await runAdapterSearch({ kind: "keywords", keywords: "engineer", location: null, remoteOnly: false }, [adapter], "corr-1");

    expect(envelope.errors).toEqual([]);
    expect(envelope.meta.degraded).toBe(false);
    expect(envelope.results).toHaveLength(1);
    expect(envelope.results[0]).toMatchObject({ source: "run-search-happy", label: adapter.metadata.displayName });
    expect(envelope.results[0].listings).toHaveLength(2);
    expect(envelope.meta.perSourceTiming["run-search-happy"].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("degrades gracefully: a failing source produces an errors[] entry, empty listings, and never rejects the overall search", async () => {
    const adapter = withId("run-search-error");
    const envelope = await runAdapterSearch({ kind: "keywords", keywords: "ERROR_TEST", location: null, remoteOnly: false }, [adapter], "corr-2");

    expect(envelope.meta.degraded).toBe(true);
    expect(envelope.results[0].listings).toEqual([]);
    expect(envelope.errors).toEqual([
      expect.objectContaining({ sourceId: "run-search-error", kind: "http-error", retryable: true }),
    ]);
  });

  it("opens the circuit breaker after 3 consecutive failures and skips calling search() on the 4th", async () => {
    const adapter = withId("run-search-circuit");
    const searchSpy = vi.spyOn(adapter, "search");
    const query = { kind: "keywords" as const, keywords: "ERROR_TEST", location: null, remoteOnly: false };

    await runAdapterSearch(query, [adapter], "corr-3a");
    await runAdapterSearch(query, [adapter], "corr-3b");
    await runAdapterSearch(query, [adapter], "corr-3c");
    expect(searchSpy).toHaveBeenCalledTimes(3);

    const envelope = await runAdapterSearch(query, [adapter], "corr-3d");
    expect(searchSpy).toHaveBeenCalledTimes(3); // not called a 4th time
    expect(envelope.errors[0]).toMatchObject({ sourceId: "run-search-circuit", kind: "circuit-open", retryable: true });
  });
});
