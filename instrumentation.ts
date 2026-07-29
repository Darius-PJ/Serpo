// Runs once when the server starts (stable since Next.js 15 — no config flag needed).
// Config validation at boot (Phase 3): warns about any unconfigured adapter and
// excludes it from search, but never crashes the server. Harmless no-op today since
// lib/jobAdapters/registry.ts's ADAPTERS array is still empty (Phase 4 populates it).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { listAdapters } = await import("./lib/jobAdapters/registry");
  const { logConfigWarnings } = await import("./lib/jobAdapters/config");
  const { createLogger } = await import("./lib/jobAdapters/services/logger");

  logConfigWarnings(listAdapters(), createLogger({ phase: "boot" }));
}
