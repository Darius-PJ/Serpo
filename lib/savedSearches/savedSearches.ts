// Saved searches: a search from Sourcing kept with a cadence, plus its triage
// inbox of hits. Runs go through the same pipeline as a manual search
// (lib/jobSources/runJobSearch.ts). Automation may run a search and record
// hits; only the user tracks one.
import "server-only";
import { Prisma, type SavedSearch } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { listExcludedUrls, runJobSearch } from "@/lib/jobSources/runJobSearch";
import type { JobSearchCriteria, NormalizedJobListing } from "@/lib/jobSources/types";
import { parseStoredJobSpySites, selectedJobSpySites, type JobSpySite } from "@/lib/jobSpyBoards";
import { isCadence, JOBSPY_CADENCES, type Cadence } from "@/lib/automation/cadence";
import { savedSearchJobKeyPrefix } from "@/lib/automation/jobs";

const MAX_NAME_LENGTH = 100;
// The inbox shows the newest hits; older ones stay stored and keep blocking reposts.
const MAX_LISTED_HITS = 200;

/** A request the saved-search rules reject. Routes answer it with 400. */
export class SavedSearchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedSearchInputError";
  }
}

export interface SavedSearchSummary {
  id: string;
  name: string;
  keywords: string;
  location: string;
  remoteOnly: boolean;
  employmentType: "any" | "contract";
  jobSpySites: JobSpySite[];
  cadence: Cadence;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date;
  /** Hits first seen since the user last opened this search's inbox. */
  newCount: number;
}

export interface SavedSearchHitView {
  id: string;
  listing: NormalizedJobListing;
  firstSeenAt: Date;
  isNew: boolean;
}

export interface SavedSearchRun {
  newHits: number;
  /** Listings the run returned after filtering, dedupe, and exclusion. */
  listings: number;
  /** Labels of the sources that reported an error. */
  failedSources: string[];
  /** Every source errored and nothing came back: the run found out nothing. */
  allSourcesFailed: boolean;
}

export interface NewListingCount {
  savedSearchId: string;
  name: string;
  count: number;
  /** When the oldest of these new hits was first seen. */
  oldestAt: Date;
}

function assertCadenceAllowed(cadence: Cadence, jobSpySites: JobSpySite[]): void {
  if (jobSpySites.length > 0 && !JOBSPY_CADENCES.includes(cadence)) {
    throw new SavedSearchInputError(
      "A search that includes JobSpy boards runs at most once a day. Choose Daily or Weekdays, or clear the JobSpy boards.",
    );
  }
}

function summarize(search: SavedSearch, newCount: number): SavedSearchSummary {
  return {
    id: search.id,
    name: search.name,
    keywords: search.keywords,
    location: search.location,
    remoteOnly: search.remoteOnly,
    employmentType: search.employmentType === "contract" ? "contract" : "any",
    jobSpySites: parseStoredJobSpySites(search.jobSpySites),
    cadence: isCadence(search.cadence) ? search.cadence : "daily",
    enabled: search.enabled,
    lastRunAt: search.lastRunAt,
    nextRunAt: search.nextRunAt,
    newCount,
  };
}

/**
 * New hits per search: first seen after the search's lastViewedAt, not
 * dismissed, and not since tracked or eliminated.
 */
async function newHitsBySearch(
  userId: string,
  searches: Array<Pick<SavedSearch, "id" | "lastViewedAt">>,
): Promise<Map<string, { count: number; oldestAt: Date }>> {
  const bySearch = new Map<string, { count: number; oldestAt: Date }>();
  if (searches.length === 0) return bySearch;
  const hits = await prisma.savedSearchHit.findMany({
    where: {
      dismissedAt: null,
      OR: searches.map((search) => ({ savedSearchId: search.id, firstSeenAt: { gt: search.lastViewedAt } })),
    },
    select: { savedSearchId: true, url: true, firstSeenAt: true },
  });
  const excluded = await listExcludedUrls(userId, hits.map((hit) => hit.url));
  for (const hit of hits) {
    if (excluded.has(hit.url)) continue;
    const entry = bySearch.get(hit.savedSearchId);
    if (!entry) {
      bySearch.set(hit.savedSearchId, { count: 1, oldestAt: hit.firstSeenAt });
    } else {
      entry.count++;
      if (hit.firstSeenAt < entry.oldestAt) entry.oldestAt = hit.firstSeenAt;
    }
  }
  return bySearch;
}

export async function createSavedSearch(
  userId: string,
  input: { name: string; criteria: JobSearchCriteria; cadence: Cadence },
): Promise<SavedSearchSummary> {
  const { criteria, cadence } = input;
  const jobSpySites = selectedJobSpySites(criteria.jobSpySites ?? []);
  assertCadenceAllowed(cadence, jobSpySites);
  const location = criteria.location ?? "";
  const name =
    input.name.trim().slice(0, MAX_NAME_LENGTH) ||
    [criteria.keywords.trim(), location.trim()].filter(Boolean).join(" in ").slice(0, MAX_NAME_LENGTH);
  const now = new Date();
  const search = await prisma.savedSearch.create({
    data: {
      userId,
      name,
      keywords: criteria.keywords,
      location,
      remoteOnly: Boolean(criteria.remoteOnly),
      employmentType: criteria.employmentType === "contract" ? "contract" : "any",
      jobSpySites: JSON.stringify(jobSpySites),
      cadence,
      // Due at once: with automation on, the next tick runs it.
      nextRunAt: now,
      lastViewedAt: now,
    },
  });
  return summarize(search, 0);
}

export async function listSavedSearches(userId: string): Promise<SavedSearchSummary[]> {
  const searches = await prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const counts = await newHitsBySearch(userId, searches);
  return searches.map((search) => summarize(search, counts.get(search.id)?.count ?? 0));
}

/** Per-search counts of new hits, for the attention queue and the Sourcing badge. Searches with none are left out. */
export async function listNewListingCounts(userId: string): Promise<NewListingCount[]> {
  const searches = await prisma.savedSearch.findMany({
    where: { userId },
    select: { id: true, name: true, lastViewedAt: true },
    orderBy: { createdAt: "asc" },
  });
  const counts = await newHitsBySearch(userId, searches);
  return searches.flatMap((search) => {
    const entry = counts.get(search.id);
    return entry ? [{ savedSearchId: search.id, name: search.name, count: entry.count, oldestAt: entry.oldestAt }] : [];
  });
}

export async function updateSavedSearch(
  userId: string,
  savedSearchId: string,
  patch: { name?: string; cadence?: Cadence; enabled?: boolean },
): Promise<SavedSearchSummary | null> {
  const existing = await prisma.savedSearch.findUnique({ where: { id_userId: { id: savedSearchId, userId } } });
  if (!existing) return null;

  const data: Prisma.SavedSearchUpdateInput = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) throw new SavedSearchInputError("name must not be empty");
    data.name = name;
  }
  if (patch.cadence !== undefined && patch.cadence !== existing.cadence) {
    assertCadenceAllowed(patch.cadence, parseStoredJobSpySites(existing.jobSpySites));
    data.cadence = patch.cadence;
    // Reschedule under the new cadence; the next tick settles the slot.
    data.nextRunAt = new Date();
  }
  if (patch.enabled !== undefined) data.enabled = patch.enabled;

  const search = await prisma.savedSearch.update({ where: { id: savedSearchId }, data });
  const counts = await newHitsBySearch(userId, [search]);
  return summarize(search, counts.get(search.id)?.count ?? 0);
}

/** Deletes the search, its hits, and any of its runs that aren't mid-flight. */
export async function deleteSavedSearch(userId: string, savedSearchId: string): Promise<boolean> {
  const { count } = await prisma.savedSearch.deleteMany({ where: { id: savedSearchId, userId } });
  if (count === 0) return false;
  await prisma.automationJob.deleteMany({
    where: { userId, idempotencyKey: { startsWith: savedSearchJobKeyPrefix(savedSearchId) }, status: { not: "running" } },
  });
  return true;
}

/** Opening a search's inbox: its current hits stop counting as new. */
export async function markSavedSearchViewed(userId: string, savedSearchId: string): Promise<boolean> {
  const { count } = await prisma.savedSearch.updateMany({
    where: { id: savedSearchId, userId },
    data: { lastViewedAt: new Date() },
  });
  return count > 0;
}

/** Hides a hit from its inbox for good. The row stays so a repost of the same listing is not new again. */
export async function dismissSavedSearchHit(userId: string, savedSearchId: string, hitId: string): Promise<boolean> {
  const { count } = await prisma.savedSearchHit.updateMany({
    where: { id: hitId, savedSearchId, savedSearch: { userId } },
    data: { dismissedAt: new Date() },
  });
  return count > 0;
}

/** The inbox: undismissed hits, newest first, without listings the user has since tracked or eliminated. Null for an unknown search. */
export async function listSavedSearchHits(userId: string, savedSearchId: string): Promise<SavedSearchHitView[] | null> {
  const search = await prisma.savedSearch.findUnique({ where: { id_userId: { id: savedSearchId, userId } } });
  if (!search) return null;
  const hits = await prisma.savedSearchHit.findMany({
    where: { savedSearchId, dismissedAt: null },
    orderBy: { firstSeenAt: "desc" },
    take: MAX_LISTED_HITS,
  });
  const excluded = await listExcludedUrls(userId, hits.map((hit) => hit.url));
  return hits
    .filter((hit) => !excluded.has(hit.url))
    .map((hit) => ({
      id: hit.id,
      listing: JSON.parse(hit.listingJson) as NormalizedJobListing,
      firstSeenAt: hit.firstSeenAt,
      isNew: hit.firstSeenAt > search.lastViewedAt,
    }));
}

/**
 * Records the listings a run returned that are new to this search: no hit
 * yet for the listing, and none for its dedupe family, so a repost of a
 * listing already seen (tracked, dismissed, or still in the inbox) is not new.
 * Returns how many hits were added.
 */
async function recordHits(savedSearchId: string, listings: NormalizedJobListing[], seenAt: Date): Promise<number> {
  if (listings.length === 0) return 0;
  const listingIds = listings.map((listing) => listing.id);
  // The pipeline's dedupe step fingerprints every listing it returns.
  const fingerprints = await prisma.jobListingFingerprint.findMany({
    where: { listingId: { in: listingIds } },
    select: { listingId: true, familyId: true },
  });
  const familyByListing = new Map(fingerprints.map((row) => [row.listingId, row.familyId]));
  const known = await prisma.savedSearchHit.findMany({
    where: {
      savedSearchId,
      OR: [{ listingId: { in: listingIds } }, { familyId: { in: [...new Set(familyByListing.values())] } }],
    },
    select: { listingId: true, familyId: true },
  });
  const seenListings = new Set(known.map((hit) => hit.listingId));
  const seenFamilies = new Set(known.map((hit) => hit.familyId));

  let added = 0;
  for (const listing of listings) {
    // A listing dedupe never saw heads its own family, by dedupe's convention.
    const familyId = familyByListing.get(listing.id) ?? listing.id;
    if (seenListings.has(listing.id) || seenFamilies.has(familyId)) continue;
    seenListings.add(listing.id);
    seenFamilies.add(familyId);
    try {
      await prisma.savedSearchHit.create({
        data: { savedSearchId, listingId: listing.id, familyId, url: listing.url, listingJson: JSON.stringify(listing), firstSeenAt: seenAt },
      });
      added++;
    } catch (err) {
      // A concurrent run of this search recorded it first.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  return added;
}

/**
 * Runs a saved search through the shared pipeline and records its new hits.
 * Unattended runs (the scheduler) skip a paused search and scrape only the
 * JobSpy boards the user consented to in Settings; "Run now" uses every board
 * the search selected. Null for an unknown search, or a paused one unattended.
 */
export async function runSavedSearch(
  userId: string,
  savedSearchId: string,
  options: { unattended?: { jobSpyConsent: JobSpySite[] } } = {},
): Promise<SavedSearchRun | null> {
  const search = await prisma.savedSearch.findUnique({ where: { id_userId: { id: savedSearchId, userId } } });
  if (!search || (options.unattended && !search.enabled)) return null;

  const selectedSites = parseStoredJobSpySites(search.jobSpySites);
  const consent = options.unattended?.jobSpyConsent;
  // Field for field what the search form sends, so both share cache entries.
  const criteria: JobSearchCriteria = {
    keywords: search.keywords,
    location: search.location,
    remoteOnly: search.remoteOnly,
    employmentType: search.employmentType === "contract" ? "contract" : "any",
    jobSpySites: consent ? selectedSites.filter((site) => consent.includes(site)) : selectedSites,
  };
  const { results } = await runJobSearch(userId, criteria);

  const listings = results.flatMap((group) => group.listings);
  // Stamped after the search returns, so a view during a long run can't hide these hits.
  const seenAt = new Date();
  const newHits = await recordHits(search.id, listings, seenAt);
  await prisma.savedSearch.updateMany({ where: { id: search.id }, data: { lastRunAt: seenAt } });

  const failedSources = results.filter((group) => group.error).map((group) => group.label);
  return {
    newHits,
    listings: listings.length,
    failedSources,
    allSourcesFailed: results.length > 0 && listings.length === 0 && failedSources.length === results.length,
  };
}
