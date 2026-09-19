// Per-account "not interested" list. A user eliminates a chosen search
// listing and it never appears in future federated searches. Keyed by listing
// URL — the same identity the tracked-exclusion check uses (Application.url) —
// so tracked and eliminated listings drop out of results symmetrically.
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { JobSearchResult } from "@/lib/jobSources/types";

export interface EliminateInput {
  url: string;
  company?: string;
  role?: string;
  source?: string;
}

// A listing URL is the exclusion key, matched verbatim against listing.url in
// the search route — so it is NEVER length-truncated (job-board URLs routinely
// exceed 200 chars with tracking params). 2048 is the conventional URL ceiling.
const MAX_URL_LENGTH = 2048;

/** Validates a listing URL used as the elimination key: absolute http(s), length-capped. Returns the trimmed url, or null when unusable. */
export function normalizeListingUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return trimmed;
}

/** Upsert an elimination; idempotent on (userId, url). Throws on empty url. */
export async function addEliminatedJob(userId: string, input: EliminateInput): Promise<void> {
  const url = input.url.trim();
  if (!url) throw new Error("url is required");
  await prisma.eliminatedJob.upsert({
    where: { userId_url: { userId, url } },
    update: {},
    create: { userId, url, company: input.company, role: input.role, source: input.source },
  });
}

/** Remove this account's elimination for url. Idempotent — no-op when absent. */
export async function removeEliminatedJob(userId: string, url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  await prisma.eliminatedJob.deleteMany({ where: { userId, url: trimmed } });
}

/** Of the given candidate urls, the subset this account has eliminated. */
export async function listEliminatedUrls(userId: string, urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const rows = await prisma.eliminatedJob.findMany({
    where: { userId, url: { in: urls } },
    select: { url: true },
  });
  return new Set(rows.map((row) => row.url));
}

/** Drop every listing whose url is in `urls`, preserving group order/labels. Pure. */
export function filterOutUrls(results: JobSearchResult[], urls: Set<string>): JobSearchResult[] {
  if (urls.size === 0) return results;
  return results.map((group) => ({
    ...group,
    listings: group.listings.filter((listing) => !urls.has(listing.url)),
  }));
}
