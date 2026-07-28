import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { computeSimhash, hammingSimilarity } from "./simhash";
import { isStaffingAgency } from "./staffingAgencies";
import { getDedupSimilarityThreshold } from "./dedupeConfig";
import type { NormalizedJobListing } from "./types";

function contentHashFor(listing: NormalizedJobListing): string {
  return createHash("sha256").update(`${listing.role}\n${listing.description ?? ""}`).digest("hex");
}

function textFor(listing: NormalizedJobListing): string {
  return `${listing.role}\n\n${listing.description ?? ""}`;
}

interface RepresentativeState {
  listingId: string;
  familyId: string;
  simhash: string;
  isAgency: boolean;
  listingJson: string;
}

/**
 * Collapses cross-posted duplicates by clustering listings whose title+
 * description text is similar (SimHash + Hamming distance — see
 * lib/jobSources/simhash.ts), not just an exact company/role/location match.
 * Every listing ever seen gets one JobListingFingerprint row; a listing
 * whose id AND content are unchanged since last time reuses its existing
 * family with zero comparison work — this is the "only re-run clustering on
 * new/changed records" half of the feature. The other half
 * (lib/jobSources/cache.ts) means most searches feed this function a much
 * smaller "new/changed" set to begin with, since unchanged sources are
 * served from cache and never even re-fetched.
 *
 * Fingerprints are global (no userId — see prisma/schema.prisma), so
 * clustering work done for one account's search benefits every later
 * search, by any account.
 */
export async function dedupeListings(listings: NormalizedJobListing[]): Promise<NormalizedJobListing[]> {
  if (listings.length === 0) return [];

  const threshold = getDedupSimilarityThreshold();
  const contentHashById = new Map(listings.map((l) => [l.id, contentHashFor(l)]));

  const existingRows = await prisma.jobListingFingerprint.findMany({
    where: { listingId: { in: listings.map((l) => l.id) } },
  });
  const existingByListingId = new Map(existingRows.map((r) => [r.listingId, r]));

  const familyIdByListingId = new Map<string, string>();
  const toProcess: NormalizedJobListing[] = [];

  for (const listing of listings) {
    const existing = existingByListingId.get(listing.id);
    if (existing && existing.contentHash === contentHashById.get(listing.id)) {
      familyIdByListingId.set(listing.id, existing.familyId);
    } else {
      toProcess.push(listing);
    }
  }

  if (toProcess.length > 0) {
    const representativeRows = await prisma.jobListingFingerprint.findMany({ where: { isRepresentative: true } });
    // Mutable working copy: a family created earlier in this same batch must
    // be visible to later listings in the batch, so two new duplicates that
    // don't match any *existing* representative can still merge with each
    // other (a small in-memory union-find over just this batch).
    const repByFamilyId = new Map<string, RepresentativeState>(
      representativeRows.map((r) => [r.familyId, { listingId: r.listingId, familyId: r.familyId, simhash: r.simhash, isAgency: r.isAgency, listingJson: r.listingJson }])
    );

    // Keyed by listingId (not a plain array) so that if a listing demoted
    // this batch is *also* one of this same batch's own upserts (e.g. the
    // very first-ever call, where an "existing representative" was actually
    // just created a few iterations ago in this same loop), promoting a
    // later listing can patch that pending entry directly — otherwise its
    // stale isRepresentative: true would run after, and overwrite, the
    // separate demotion query below.
    const upsertByListingId = new Map<
      string,
      { listingId: string; familyId: string; simhash: string; contentHash: string; isAgency: boolean; isRepresentative: boolean; listingJson: string }
    >();
    const demotedListingIds = new Set<string>();

    for (const listing of toProcess) {
      const simhash = computeSimhash(textFor(listing));
      const isAgency = isStaffingAgency(listing.company);
      const contentHash = contentHashById.get(listing.id)!;
      const listingJson = JSON.stringify(listing);

      let bestFamilyId: string | null = null;
      let bestScore = -1;
      for (const rep of repByFamilyId.values()) {
        const score = hammingSimilarity(simhash, rep.simhash);
        if (score >= threshold && score > bestScore) {
          bestScore = score;
          bestFamilyId = rep.familyId;
        }
      }

      if (bestFamilyId) {
        const rep = repByFamilyId.get(bestFamilyId)!;
        // Prefer a direct-employer posting over a staffing-agency repost of
        // the same job, per the request — promote only in that direction.
        const shouldPromote = !isAgency && rep.isAgency;
        upsertByListingId.set(listing.id, { listingId: listing.id, familyId: bestFamilyId, simhash, contentHash, isAgency, isRepresentative: shouldPromote, listingJson });
        if (shouldPromote) {
          const repUpsert = upsertByListingId.get(rep.listingId);
          if (repUpsert) {
            repUpsert.isRepresentative = false;
          } else {
            demotedListingIds.add(rep.listingId);
          }
          repByFamilyId.set(bestFamilyId, { listingId: listing.id, familyId: bestFamilyId, simhash, isAgency, listingJson });
        }
      } else {
        // No existing family matched — start a new one, keyed by this
        // listing's own id (no extra id-generation step needed).
        const familyId = listing.id;
        upsertByListingId.set(listing.id, { listingId: listing.id, familyId, simhash, contentHash, isAgency, isRepresentative: true, listingJson });
        repByFamilyId.set(familyId, { listingId: listing.id, familyId, simhash, isAgency, listingJson });
      }
    }

    const upserts = [...upsertByListingId.values()];
    await prisma.$transaction([
      ...(demotedListingIds.size > 0
        ? [prisma.jobListingFingerprint.updateMany({ where: { listingId: { in: [...demotedListingIds] } }, data: { isRepresentative: false } })]
        : []),
      ...upserts.map((u) => prisma.jobListingFingerprint.upsert({ where: { listingId: u.listingId }, create: u, update: u })),
    ]);

    for (const u of upserts) familyIdByListingId.set(u.listingId, u.familyId);
  }

  // Pick the best representative from *this call's own input* per family —
  // deliberately never a historical listing from some earlier search that
  // isn't part of today's results, so a long-remembered representative can
  // never outlive its own posting (e.g. the job closing) by masking today's
  // actual live listings for that family. The persisted isRepresentative
  // flag above still does its job across searches (deciding which existing
  // family a new/changed listing joins) — this step only decides what THIS
  // call returns.
  const bestByFamilyId = new Map<string, NormalizedJobListing>();
  for (const listing of listings) {
    const familyId = familyIdByListingId.get(listing.id);
    if (!familyId) continue; // should be unreachable; never drop data over it
    const current = bestByFamilyId.get(familyId);
    if (!current || (isStaffingAgency(current.company) && !isStaffingAgency(listing.company))) {
      bestByFamilyId.set(familyId, listing);
    }
  }
  return [...bestByFamilyId.values()];
}
