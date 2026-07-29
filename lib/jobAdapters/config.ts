// Config validation, checked per-adapter — never at import time, never throws. A
// missing required env var marks that one adapter unconfigured; it must never crash
// the server (matching today's per-connector isConfigured() contract in
// lib/jobSources/*.ts, which this generalizes rather than replaces).
import type { Adapter, Logger } from "./types";

export interface ConfigValidationResult {
  configured: boolean;
  missing: string[];
}

export function validateAdapterConfig(adapter: Adapter): ConfigValidationResult {
  const missing = adapter.configSchema.filter((field) => field.required && !process.env[field.envVar]).map((field) => field.envVar);
  return { configured: missing.length === 0, missing };
}

// isConfigured() stays the source of truth (an adapter may have configuration logic
// beyond a simple "env var present" check, same as today's connectors) — this is a
// convenience that also cross-checks configSchema so a declared-but-unset required
// field surfaces even if an adapter's own isConfigured() forgot to check it.
export function isAdapterConfigured(adapter: Adapter): boolean {
  return adapter.isConfigured() && validateAdapterConfig(adapter).configured;
}

// Called once at boot (see instrumentation.ts) and safe to call again any time — it
// only logs, never throws, and never mutates the registry. Warnings are the entire
// mechanism for "excluded from the registry with a warning": exclusion itself happens
// naturally every time listConfiguredAdapters()/isAdapterConfigured() is evaluated.
export function logConfigWarnings(adapters: Adapter[], logger: Logger): void {
  for (const adapter of adapters) {
    const result = validateAdapterConfig(adapter);
    if (!result.configured) {
      logger.warn("adapter unconfigured, excluded from search", {
        sourceId: adapter.metadata.id,
        missingEnvVars: result.missing,
      });
    }
  }
}
