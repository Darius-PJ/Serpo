// The Phase 4 strangler-fig seam for the static CONNECTORS path. Always computes the
// full legacy result set first (reusing all of searchAllSources' existing, already-
// proven caching/error-handling untouched — zero duplication of that logic), then
// overlays the new adapter path per-source only where one has been migrated
// (registry.ts), per the current ADAPTER_MODE. legacy mode: passthrough, unchanged.
// dual mode: also runs the migrated adapter, logs any count mismatch, but still SERVES
// the legacy result — this mode can never change what a user sees. adapter mode:
// serves the migrated adapter's result for migrated sources (falls back to legacy for
// anything not yet migrated, so coverage never drops mid-migration).
//
// Known inefficiency, accepted deliberately: in "adapter"/"dual" mode this computes
// both paths for every migrated source (extra network calls) — acceptable since this
// whole bridge is removed in Phase 5, not a permanent architecture.
import { searchAllSources, type JobSearchResult } from "@/lib/jobSources";
import { getAdapterMode } from "./adapterMode";
import { runMigratedStaticAdapter, logDualModeDiff } from "./bridge";
import type { JobSearchCriteria } from "@/lib/jobSources/types";

export async function searchAllSourcesHybrid(criteria: JobSearchCriteria, correlationId: string): Promise<JobSearchResult[]> {
  const mode = getAdapterMode();
  const legacyResults = await searchAllSources(criteria);
  if (mode === "legacy") return legacyResults;

  return Promise.all(
    legacyResults.map(async (legacyResult): Promise<JobSearchResult> => {
      const bridged = await runMigratedStaticAdapter(legacyResult.source, criteria, correlationId).catch((err) => ({
        listings: [],
        error: err instanceof Error ? err.message : String(err),
      }));
      if (!bridged) return legacyResult; // not migrated yet — legacy already has the real result

      if (mode === "dual") {
        logDualModeDiff(legacyResult.source, legacyResult.listings.length, bridged.listings.length);
        return legacyResult;
      }

      // mode === "adapter"
      return { source: legacyResult.source, label: legacyResult.label, listings: bridged.listings, error: bridged.error };
    })
  );
}
