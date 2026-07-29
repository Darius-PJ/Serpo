import { getSourceFetchTimeoutMs } from "@/lib/jobSources/timeoutConfig";
import { createLogger } from "./services/logger";
import { createRateLimiterHandle } from "./services/rateLimiter";
import { createCacheHandle } from "./services/cache";
import { createCircuitBreakerHandle } from "./services/circuitBreaker";
import type { Adapter, AdapterContext } from "./types";

export function createAdapterContext(adapter: Adapter, correlationId: string, timeoutMs = getSourceFetchTimeoutMs()): AdapterContext {
  const deadline = Date.now() + timeoutMs;
  return {
    signal: AbortSignal.timeout(timeoutMs),
    deadline,
    logger: createLogger({ correlationId, sourceId: adapter.metadata.id }),
    rateLimiter: createRateLimiterHandle(adapter.metadata.id, adapter.capabilities.cost),
    cache: createCacheHandle(adapter.metadata.id, adapter.capabilities),
    circuitBreaker: createCircuitBreakerHandle(adapter.metadata.id),
    correlationId,
  };
}
