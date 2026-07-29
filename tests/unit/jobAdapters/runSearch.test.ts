import { afterEach, describe, expect, it, vi } from "vitest";
import { runAdapterSearch } from "@/lib/jobAdapters/runSearch";
import { keywordAdapter } from "@/lib/jobAdapters/testing/fixtureAdapters";
import { resetCircuitBreakerStateForTests } from "@/lib/jobAdapters/services/circuitBreaker";
import { resetRateLimiterStateForTests } from "@/lib/jobAdapters/services/rateLimiter";
import type { Adapter } from "@/lib/jobAdapters/types";

function withId(id: string): Adapter {
  return { ...keywordAdapter, metadata: { ...keywordAdapter.metadata, id }, capabilities: { ...keywordAdapter.capabilities, cacheable: false } };
}

afterEach(() => {
  resetCircuitBreakerStateForTests();
  resetRateLimiterStateForTests();
});

describe("runAdapterSearch", () => {
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
