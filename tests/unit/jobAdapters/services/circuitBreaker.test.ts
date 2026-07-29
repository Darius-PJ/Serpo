import { afterEach, describe, expect, it, vi } from "vitest";
import { createCircuitBreakerHandle, resetCircuitBreakerStateForTests } from "@/lib/jobAdapters/services/circuitBreaker";

afterEach(() => {
  resetCircuitBreakerStateForTests();
  vi.useRealTimers();
});

describe("circuit breaker", () => {
  it("starts closed", () => {
    const breaker = createCircuitBreakerHandle("source-a");
    expect(breaker.isOpen()).toBe(false);
  });

  it("opens after 3 consecutive failures", () => {
    const breaker = createCircuitBreakerHandle("source-b");
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false);
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);
  });

  it("a success resets the failure count", () => {
    const breaker = createCircuitBreakerHandle("source-c");
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(false); // only 2 consecutive since the reset
  });

  it("half-opens (allows a retry) once the cooldown window elapses", () => {
    vi.useFakeTimers();
    const breaker = createCircuitBreakerHandle("source-d");
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    vi.advanceTimersByTime(61_000);
    expect(breaker.isOpen()).toBe(false);
  });
});
