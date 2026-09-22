import { getSourceFetchTimeoutMs, getJobSpyTimeoutMs } from "@/lib/jobSources/timeoutConfig";
import { createLogger } from "./services/logger";
import { createRateLimiterHandle } from "./services/rateLimiter";
import { createCacheHandle } from "./services/cache";
import { createCircuitBreakerHandle } from "./services/circuitBreaker";
import type { Adapter, AdapterCapabilities, AdapterContext } from "./types";

// A fixed 15s default would kill a "very-slow" adapter's (e.g. JobSpy's subprocess)
// legitimate work mid-flight — ctx's deadline must scale with what the adapter itself
// declared, not one global constant. Reuses JOBSPY_TIMEOUT_MS (already a proven,
// configurable budget) for "very-slow" rather than inventing a second env var for the
// same concept.
function defaultTimeoutForLatencyClass(latencyClass: AdapterCapabilities["latencyClass"]): number {
  switch (latencyClass) {
    case "very-slow":
      return getJobSpyTimeoutMs();
    case "slow":
      return 30_000;
    case "fast":
    default:
      return getSourceFetchTimeoutMs();
  }
}

export function createAdapterContext(adapter: Adapter, correlationId: string, timeoutMs?: number): AdapterContext {
  const resolvedTimeoutMs = timeoutMs ?? defaultTimeoutForLatencyClass(adapter.capabilities.latencyClass);
  // Queued adapters must not spend their I/O budget waiting for another source.
  // Start once, on first signal/deadline access at execution, never on creation.
  let timing: { signal: AbortSignal; deadline: number } | undefined;
  const start = () => timing ??= {
    signal: AbortSignal.timeout(resolvedTimeoutMs),
    deadline: Date.now() + resolvedTimeoutMs,
  };
  return {
    get signal() { return start().signal; },
    get deadline() { return start().deadline; },
    logger: createLogger({ correlationId, sourceId: adapter.metadata.id }),
    rateLimiter: createRateLimiterHandle(adapter.metadata.id, adapter.capabilities.cost),
    cache: createCacheHandle(adapter.metadata.id, adapter.capabilities),
    circuitBreaker: createCircuitBreakerHandle(adapter.metadata.id),
    correlationId,
  };
}
