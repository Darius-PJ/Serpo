// The Phase 4 strangler-fig seam for per-account dynamic board integrations
// (Greenhouse/Lever), mirroring hybridSearch.ts's design exactly: always compute the
// full legacy result first (searchPoolBoards, untouched), then overlay per-pin only
// where a matching enumerate-target adapter is registered, per ADAPTER_MODE.
import { searchPoolBoards } from "@/lib/jobSources/searchPoolBoards";
import type { JobSearchResult } from "@/lib/jobSources";
import { getAdapterMode } from "./adapterMode";
import { runMigratedTargetAdapter, logDualModeDiff } from "./bridge";
import { findAdapterById } from "./registry";

export async function searchPoolBoardsHybrid(userId: string, criteria: { keywords: string }, correlationId: string): Promise<JobSearchResult[]> {
  const mode = getAdapterMode();
  const legacyResults = await searchPoolBoards(userId, criteria);
  if (mode === "legacy") return legacyResults;

  return Promise.all(
    legacyResults.map(async (legacyResult): Promise<JobSearchResult> => {
      // legacyResult.source is "<integrationType>:<token>", e.g. "greenhouse:stripe"
      const separatorIndex = legacyResult.source.indexOf(":");
      if (separatorIndex === -1) return legacyResult;
      const integrationType = legacyResult.source.slice(0, separatorIndex);
      const token = legacyResult.source.slice(separatorIndex + 1);

      const adapter = findAdapterById(integrationType);
      if (!adapter) return legacyResult; // not migrated yet (e.g. a future third ATS platform)

      const bridged = await runMigratedTargetAdapter(integrationType, token, correlationId).catch((err) => ({
        listings: [],
        error: err instanceof Error ? err.message : String(err),
      }));
      if (!bridged) return legacyResult;

      if (mode === "dual") {
        logDualModeDiff(legacyResult.source, legacyResult.listings.length, bridged.listings.length);
        return legacyResult;
      }

      return { source: legacyResult.source, label: legacyResult.label, listings: bridged.listings, error: bridged.error };
    })
  );
}
