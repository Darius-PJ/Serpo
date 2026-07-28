import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getJobCacheTtlMinutes } from "./dedupeConfig";
import type { NormalizedJobListing } from "./types";

function hashCriteria(criteria: object): string {
  const canonical = JSON.stringify(criteria, Object.keys(criteria).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/** Returns cached listings for this source+criteria if present and within the TTL, else null (cache miss/stale). */
export async function getCachedListings(source: string, criteria: object): Promise<NormalizedJobListing[] | null> {
  const criteriaHash = hashCriteria(criteria);
  const row = await prisma.jobSourceCache.findUnique({ where: { source_criteriaHash: { source, criteriaHash } } });
  if (!row) return null;

  const ttlMs = getJobCacheTtlMinutes() * 60_000;
  if (Date.now() - row.fetchedAt.getTime() > ttlMs) return null;

  try {
    return JSON.parse(row.listingsJson) as NormalizedJobListing[];
  } catch {
    return null;
  }
}

/** Stores this source+criteria's normalized results, resetting the TTL clock. Only call this after a successful fetch — never cache an empty/error result. */
export async function setCachedListings(
  source: string,
  criteria: object,
  listings: NormalizedJobListing[]
): Promise<void> {
  const criteriaHash = hashCriteria(criteria);
  const listingsJson = JSON.stringify(listings);
  await prisma.jobSourceCache.upsert({
    where: { source_criteriaHash: { source, criteriaHash } },
    create: { source, criteriaHash, listingsJson },
    update: { listingsJson, fetchedAt: new Date() },
  });
}
