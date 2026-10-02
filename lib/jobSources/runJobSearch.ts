// The one federated search pipeline, shared by POST /api/jobs/search and the
// saved-search runs in lib/savedSearches: fetch every configured adapter and
// the user's live pool boards, filter, dedupe, then drop listings this user
// already tracks or has eliminated.
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { searchAllAdapters, searchPoolBoardAdapters } from "@/lib/jobAdapters/search";
import { selectedJobSpySites } from "@/lib/jobSpyBoards";
import { dedupeListings } from "./dedupe";
import { scoreTitleRelevance, isSeniorTitle } from "./titleMatch";
import { familyAliasesFor } from "./roleFamilies";
import { listTitleAliases, type StoredTitleAlias } from "./titleAliases";
import { listEliminatedUrls, filterOutUrls } from "./eliminatedJobs";
import { isUsOrRemoteListing, isRemoteListing } from "./locationFilter";
import { isContractListing } from "./employmentType";
import type { JobSearchCriteria, JobSearchResult } from "./types";

const MAX_FIELD_LENGTH = 200;

/**
 * Reads search criteria from an untrusted request body, in the shape the
 * search form sends. Null when there are no keywords to search for.
 */
export function parseJobSearchCriteria(body: unknown): JobSearchCriteria | null {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const keywords = typeof input.keywords === "string" ? input.keywords.slice(0, MAX_FIELD_LENGTH) : "";
  if (!keywords.trim()) return null;
  return {
    jobSpySites: selectedJobSpySites(input.jobSpySites),
    keywords,
    location: typeof input.location === "string" ? input.location.slice(0, MAX_FIELD_LENGTH) : undefined,
    remoteOnly: Boolean(input.remoteOnly),
    employmentType: input.employmentType === "contract" ? "contract" : "any",
  };
}

export interface JobSearchOutcome {
  /** Per-source groups after filtering, dedupe, and tracked/eliminated exclusion. */
  results: JobSearchResult[];
  /** The user's curated aliases for these keywords, so the form can show them as chips. */
  titleAliases: StoredTitleAlias[];
}

export async function runJobSearch(userId: string, criteria: JobSearchCriteria): Promise<JobSearchOutcome> {
  const correlationId = crypto.randomUUID();
  const [staticResults, poolResults, userAliases] = await Promise.all([
    searchAllAdapters(criteria, correlationId),
    searchPoolBoardAdapters(userId, criteria, correlationId),
    listTitleAliases(userId, criteria.keywords),
  ]);

  // Uniform post-fetch filtering regardless of how fuzzy each upstream API's
  // own "search" param happened to be: tiered title relevance (exact phrase >
  // all-tokens > user alias > O*NET role family — see titleMatch.ts), entry/mid
  // level only, US-or-remote (stricter remote-only on top when asked), and for a
  // contract search, contract/temporary work only (lib/jobSources/employmentType.ts).
  // Family-tier listings survive with relevance="family" so the client can
  // group them under a collapsed "related titles" section instead of the old
  // silent drop.
  const relevanceOptions = {
    familyAliases: familyAliasesFor(criteria.keywords),
    userAliases: userAliases.map((entry) => entry.alias),
  };
  const filteredGroups = [...staticResults, ...poolResults].map((group) => ({
    ...group,
    listings: group.listings.flatMap((listing) => {
      const relevance = scoreTitleRelevance(listing.role, criteria.keywords, relevanceOptions);
      if (
        relevance === "none" ||
        isSeniorTitle(listing.role, criteria.keywords) ||
        !isUsOrRemoteListing(listing) ||
        (criteria.remoteOnly && !isRemoteListing(listing)) ||
        (criteria.employmentType === "contract" && !isContractListing(listing))
      ) {
        return [];
      }
      return [{ ...listing, relevance }];
    }),
  }));

  // Dedupe across sources, then drop cross-posted duplicates from whichever
  // group they'd otherwise still appear in — keeps per-source display counts
  // honest post-dedupe rather than double-counting a listing in two cells.
  const deduped = await dedupeListings(filteredGroups.flatMap((g) => g.listings));
  const survivingIds = new Set(deduped.map((l) => l.id));
  const results = filteredGroups.map((group) => ({
    ...group,
    listings: group.listings.filter((listing) => survivingIds.has(listing.id)),
  }));
  const excluded = await listExcludedUrls(userId, results.flatMap((group) => group.listings.map((listing) => listing.url)));

  return { results: filterOutUrls(results, excluded), titleAliases: userAliases };
}

/**
 * Of the given listing URLs, those this user already tracks (Application.url)
 * or has eliminated. Search results and saved-search hits both hide them.
 */
export async function listExcludedUrls(userId: string, urls: string[]): Promise<Set<string>> {
  const candidates = [...new Set(urls)];
  const [trackedRows, eliminatedUrls] = await Promise.all([
    candidates.length === 0
      ? []
      : prisma.application.findMany({ where: { userId, url: { in: candidates } }, select: { url: true } }),
    listEliminatedUrls(userId, candidates),
  ]);
  return new Set<string>([
    ...trackedRows.map((row) => row.url).filter((url): url is string => Boolean(url)),
    ...eliminatedUrls,
  ]);
}
