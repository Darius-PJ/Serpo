// Controls how much of app/api/jobs/search/route.ts's traffic flows through the new
// adapter path vs. the legacy lib/jobSources/ connectors during the Phase 4 migration.
export type AdapterMode = "legacy" | "dual" | "adapter";

export function getAdapterMode(): AdapterMode {
  const raw = process.env.ADAPTER_MODE;
  if (raw === "dual" || raw === "adapter") return raw;
  return "legacy";
}
