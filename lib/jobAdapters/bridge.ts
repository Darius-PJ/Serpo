// Bridges the new adapter path into the legacy JobSearchResult shape the frontend
// still expects (Phase 5 removes the legacy shape entirely; until then, both paths
// produce the same shape so callers don't need to change). Only this file — plus
// registry.ts — is allowed to know both shapes exist at once.
import { runAdapterSearch } from "./runSearch";
import { findAdapterById } from "./registry";
import { createLogger } from "./services/logger";
import type { NormalizedJobListing as NewListing } from "./types";
import type { JobSearchCriteria, NormalizedJobListing as OldListing } from "@/lib/jobSources/types";

function toLegacyListing(l: NewListing): OldListing {
  return {
    id: `${l.sourceId}:${l.sourceJobId}`,
    source: l.sourceId,
    company: l.company ?? "Unknown",
    role: l.title,
    location: l.location.raw ?? undefined,
    url: l.canonicalUrl,
    postedAt: l.postedAt ?? undefined,
    description: l.descriptionText ?? l.descriptionHtml ?? undefined,
  };
}

export interface AdapterBridgeResult {
  listings: OldListing[];
  error?: string;
}

/**
 * Runs a migrated keyword-style adapter (not enumerate-target — those are bridged
 * separately, see runMigratedTargetAdapter) if one is registered for this sourceId.
 * Returns null if no adapter is registered yet, so the caller falls back to the
 * legacy connector — this is what lets sources migrate one at a time without ever
 * dropping coverage for the ones that haven't moved yet.
 */
export async function runMigratedStaticAdapter(
  sourceId: string,
  criteria: JobSearchCriteria,
  correlationId: string
): Promise<AdapterBridgeResult | null> {
  const adapter = findAdapterById(sourceId);
  if (!adapter || adapter.capabilities.queryModel === "enumerate-target") return null;

  const query = {
    kind: "keywords" as const,
    keywords: criteria.keywords,
    location: criteria.location ?? null,
    remoteOnly: Boolean(criteria.remoteOnly),
  };
  const envelope = await runAdapterSearch(query, [adapter], correlationId);
  const group = envelope.results[0];
  const err = envelope.errors[0];
  return { listings: group ? group.listings.map(toLegacyListing) : [], error: err?.message };
}

/** Runs a migrated enumerate-target adapter (Greenhouse/Lever/...) for one board token. */
export async function runMigratedTargetAdapter(
  sourceId: string,
  target: string,
  correlationId: string
): Promise<AdapterBridgeResult | null> {
  const adapter = findAdapterById(sourceId);
  if (!adapter || adapter.capabilities.queryModel !== "enumerate-target") return null;

  const envelope = await runAdapterSearch({ kind: "target", target }, [adapter], correlationId);
  const group = envelope.results[0];
  const err = envelope.errors[0];
  return { listings: group ? group.listings.map(toLegacyListing) : [], error: err?.message };
}

// dual mode: run both, log any discrepancy, never fail the request over it. Counts
// naturally diverge for full-dump/enumerate-target adapters (whose local keyword
// filter was intentionally dropped — see e.g. adapters/arbeitnow — since
// orchestration's own uniform post-filter already re-checks every source regardless)
// — that's expected, not a bug, so this only logs, it never throws.
export function logDualModeDiff(sourceId: string, legacyCount: number, adapterCount: number): void {
  if (legacyCount !== adapterCount) {
    createLogger({ sourceId }).warn("dual-mode listing count differs between legacy and adapter path (informational only)", {
      legacyCount,
      adapterCount,
    });
  }
}
