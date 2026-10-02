// Runs once when the server starts (stable since Next.js 15 — no config flag needed)
// and must finish before the server accepts requests, so nothing here waits on work.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Dynamic imports keep these Node-only modules out of the edge build of this file.

  // Config validation at boot: warns about any unconfigured adapter and excludes
  // it from search, but never crashes the server.
  const { listAdapters } = await import("./lib/jobAdapters/registry");
  const { logConfigWarnings } = await import("./lib/jobAdapters/config");
  const { createLogger } = await import("./lib/jobAdapters/services/logger");
  logConfigWarnings(listAdapters(), createLogger({ phase: "boot" }));

  // `next build` loads this file while prerendering; automation belongs to a
  // running server only.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startAutomation } = await import("./lib/automation/ticker");
  startAutomation();
}
