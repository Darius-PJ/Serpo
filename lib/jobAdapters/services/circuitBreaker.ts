// Per-source circuit breaker (docs/adapter-interface.md 2d, outlier #9). Opens after
// N consecutive failures and stays open for a cooldown window, so a dead source is
// skipped entirely rather than paying its full timeout on every single search. This
// sits above the per-call timeout fix already shipped (lib/jobSources/timeoutConfig.ts)
// — that fix bounds the damage of one slow/hung call; this stops repeatedly paying it.
// In-memory only, same rationale as rateLimiter.ts.
import type { CircuitBreakerHandle } from "../types";

const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000;

interface State {
  consecutiveFailures: number;
  openedAtMs: number | null;
}

const states = new Map<string, State>();

function getState(sourceId: string): State {
  let state = states.get(sourceId);
  if (!state) {
    state = { consecutiveFailures: 0, openedAtMs: null };
    states.set(sourceId, state);
  }
  return state;
}

export function createCircuitBreakerHandle(sourceId: string): CircuitBreakerHandle {
  return {
    isOpen() {
      const state = getState(sourceId);
      if (state.openedAtMs === null) return false;
      if (Date.now() - state.openedAtMs >= COOLDOWN_MS) {
        // Cooldown elapsed — half-open: allow the next call through to test recovery.
        state.openedAtMs = null;
        state.consecutiveFailures = 0;
        return false;
      }
      return true;
    },
    recordSuccess() {
      const state = getState(sourceId);
      state.consecutiveFailures = 0;
      state.openedAtMs = null;
    },
    recordFailure() {
      const state = getState(sourceId);
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
        state.openedAtMs = Date.now();
      }
    },
  };
}

// Test-only: clears all in-memory breaker state between test cases.
export function resetCircuitBreakerStateForTests(): void {
  states.clear();
}
