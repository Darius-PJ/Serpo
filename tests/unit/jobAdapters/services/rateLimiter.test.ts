import { afterEach, describe, expect, it } from "vitest";
import { createRateLimiterHandle, RateLimitExceededError, resetRateLimiterStateForTests } from "@/lib/jobAdapters/services/rateLimiter";

afterEach(() => {
  resetRateLimiterStateForTests();
});

describe("rate limiter", () => {
  it("never blocks a free-tier source", async () => {
    const handle = createRateLimiterHandle("free-source", { tier: "free" });
    await expect(handle.acquire()).resolves.toBeUndefined();
    await expect(handle.acquire()).resolves.toBeUndefined();
  });

  it("throws once a daily quota is exhausted", async () => {
    const handle = createRateLimiterHandle("daily-source", { tier: "quota-limited", quotaUnit: "calls", quotaPerInterval: 2, interval: "day" });
    await handle.acquire();
    await handle.acquire();
    await expect(handle.acquire()).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it("lets a per-second token bucket's first N calls through immediately, then makes the next call wait", async () => {
    // interval: "second" (not "minute") deliberately keeps the leftover background
    // wait short (~500ms) rather than ~30s, so it doesn't drag out test teardown.
    const handle = createRateLimiterHandle("bucket-source", { tier: "quota-limited", quotaUnit: "calls", quotaPerInterval: 2, interval: "second" });
    await handle.acquire();
    await handle.acquire();

    const timeoutSentinel = Symbol("timeout");
    const raced = await Promise.race([
      handle.acquire().then(() => "resolved" as const),
      new Promise((resolve) => setTimeout(() => resolve(timeoutSentinel), 50)),
    ]);
    expect(raced).toBe(timeoutSentinel);
  });
});
