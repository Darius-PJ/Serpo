// The single search orchestration path (Phase 5 — the legacy lib/jobSources/
// connectors + registry + strangler-fig bridge are gone; this is what replaced them).
// Converts the new, richer NormalizedJobListing schema back to the flat shape
// lib/jobSources/types.ts's filtering/dedup/cache pipeline already consumes — those
// modules (titleMatch.ts, locationFilter.ts, dedupe.ts, cache.ts) are unchanged
// per this task's own rule not to touch filtering/ranking/dedup logic.
import { prisma } from "@/lib/db/prisma";
import { runAdapterSearch } from "./runSearch";
import { listConfiguredAdapters, findAdapterById } from "./registry";
import type { NormalizedJobListing as NewListing } from "./types";
import type { JobSearchCriteria, JobSearchResult, NormalizedJobListing as OldListing } from "@/lib/jobSources/types";

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

/** Searches every configured, keyword-style adapter (static sources — not board-scoped ones). */
export async function searchAllAdapters(criteria: JobSearchCriteria, correlationId: string): Promise<JobSearchResult[]> {
  const adapters = listConfiguredAdapters().filter((adapter) => adapter.capabilities.queryModel !== "enumerate-target");
  const query = {
    kind: "keywords" as const,
    keywords: criteria.keywords,
    location: criteria.location ?? null,
    remoteOnly: Boolean(criteria.remoteOnly),
  };
  const envelope = await runAdapterSearch(query, adapters, correlationId);

  return envelope.results.map((group) => {
    const err = envelope.errors.find((e) => e.sourceId === group.source);
    return { source: group.source, label: group.label, listings: group.listings.map(toLegacyListing), error: err?.message };
  });
}

/** Searches this account's live-pinned board integrations (Greenhouse/Lever/...). */
export async function searchPoolBoardAdapters(userId: string, criteria: { keywords: string }, correlationId: string): Promise<JobSearchResult[]> {
  const pins = await prisma.jobBoardPin.findMany({
    where: { userId, poolStatus: "live", integrationType: { not: null } },
    include: { jobBoard: true },
  });

  return Promise.all(
    pins.map(async (pin): Promise<JobSearchResult> => {
      const source = `${pin.integrationType}:${pin.integrationToken}`;
      const adapter = findAdapterById(pin.integrationType!);
      if (!adapter) {
        return { source, label: pin.jobBoard.name, listings: [], error: `no adapter registered for integration type "${pin.integrationType}"` };
      }

      const envelope = await runAdapterSearch({ kind: "target", target: pin.integrationToken! }, [adapter], correlationId);
      const group = envelope.results[0];
      const err = envelope.errors[0];
      return { source, label: pin.jobBoard.name, listings: group ? group.listings.map(toLegacyListing) : [], error: err?.message };
    })
  );
}
