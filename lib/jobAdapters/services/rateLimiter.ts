// Per-source token bucket (second/minute quotas) + daily quota counter (day quotas),
// keyed by sourceId. In-memory only — this app is single-instance/local-first (no
// shared cache/queue to coordinate across processes), matching every other piece of
// job-source infrastructure in this repo. Nothing tracked any of this before Phase 3
// (docs/architecture-audit.md, Open Question #5) — these are new counters, not a
// migration of existing logic.
import type { AdapterCapabilities, RateLimiterHandle } from "../types";

export class RateLimitExceededError extends Error {
  constructor(sourceId: string) {
    super(`${sourceId}: daily quota exceeded`);
    this.name = "RateLimitExceededError";
  }
}

interface Bucket {
  tokens: number;
  capacity: number;
  refillPerMs: number;
  lastRefillMs: number;
}

interface DailyQuota {
  count: number;
  limit: number;
  windowStartMs: number;
}

const buckets = new Map<string, Bucket>();
const dailyQuotas = new Map<string, DailyQuota>();
const DAY_MS = 24 * 60 * 60 * 1000;

function refill(bucket: Bucket, now: number): void {
  const elapsed = now - bucket.lastRefillMs;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
  bucket.lastRefillMs = now;
}

async function consumeToken(sourceId: string, limit: number, interval: "second" | "minute"): Promise<void> {
  const intervalMs = interval === "second" ? 1000 : 60_000;
  let bucket = buckets.get(sourceId);
  if (!bucket) {
    bucket = { tokens: limit, capacity: limit, refillPerMs: limit / intervalMs, lastRefillMs: Date.now() };
    buckets.set(sourceId, bucket);
  }

  for (;;) {
    const now = Date.now();
    refill(bucket, now);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    const msUntilNextToken = (1 - bucket.tokens) / bucket.refillPerMs;
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, msUntilNextToken)));
  }
}

function checkAndIncrementDailyQuota(sourceId: string, limit: number): void {
  const now = Date.now();
  let quota = dailyQuotas.get(sourceId);
  if (!quota || now - quota.windowStartMs >= DAY_MS) {
    quota = { count: 0, limit, windowStartMs: now };
    dailyQuotas.set(sourceId, quota);
  }
  if (quota.count >= quota.limit) {
    throw new RateLimitExceededError(sourceId);
  }
  quota.count += 1;
}

export function createRateLimiterHandle(sourceId: string, cost: AdapterCapabilities["cost"]): RateLimiterHandle {
  return {
    async acquire() {
      if (cost.tier === "free" || !cost.quotaPerInterval) return;
      if (cost.interval === "day") {
        checkAndIncrementDailyQuota(sourceId, cost.quotaPerInterval);
      } else if (cost.interval === "second" || cost.interval === "minute") {
        await consumeToken(sourceId, cost.quotaPerInterval, cost.interval);
      }
    },
  };
}

// Test-only: clears all in-memory counters between test cases.
export function resetRateLimiterStateForTests(): void {
  buckets.clear();
  dailyQuotas.clear();
}
