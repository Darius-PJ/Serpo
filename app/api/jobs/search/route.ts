import { NextResponse } from "next/server";
import { searchAllAdapters, searchPoolBoardAdapters } from "@/lib/jobAdapters/search";
import { dedupeListings } from "@/lib/jobSources/dedupe";
import { scoreTitleRelevance, isSeniorTitle } from "@/lib/jobSources/titleMatch";
import { familyAliasesFor } from "@/lib/jobSources/roleFamilies";
import { listTitleAliases } from "@/lib/jobSources/titleAliases";
import { listEliminatedUrls, filterOutUrls } from "@/lib/jobSources/eliminatedJobs";
import { isUsOrRemoteListing, isRemoteListing } from "@/lib/jobSources/locationFilter";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { selectedJobSpySites } from "@/lib/jobSpyBoards";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const keywords = typeof body.keywords === "string" ? body.keywords.slice(0, MAX_FIELD_LENGTH) : "";
  if (!keywords.trim()) {
    return NextResponse.json({ error: "keywords is required" }, { status: 400 });
  }

  const criteria = {
    jobSpySites: selectedJobSpySites(body.jobSpySites),
    keywords,
    location: typeof body.location === "string" ? body.location.slice(0, MAX_FIELD_LENGTH) : undefined,
    remoteOnly: Boolean(body.remoteOnly),
  };

  const correlationId = crypto.randomUUID();
  const [staticResults, poolResults, userAliases] = await Promise.all([
    searchAllAdapters(criteria, correlationId),
    searchPoolBoardAdapters(userId, criteria, correlationId),
    listTitleAliases(userId, criteria.keywords),
  ]);

  // Uniform post-fetch filtering regardless of how fuzzy each upstream API's
  // own "search" param happened to be: tiered title relevance (exact phrase >
  // all-tokens > user alias > O*NET role family — see titleMatch.ts), entry/mid
  // level only, and US-or-remote (stricter remote-only on top when asked).
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
        (criteria.remoteOnly && !isRemoteListing(listing))
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
  const resultUrls = [...new Set(results.flatMap((group) => group.listings.map((listing) => listing.url)))];
  const [trackedRows, eliminatedUrls] = await Promise.all([
    resultUrls.length === 0
      ? []
      : prisma.application.findMany({ where: { userId, url: { in: resultUrls } }, select: { url: true } }),
    listEliminatedUrls(userId, resultUrls),
  ]);
  const excluded = new Set<string>([
    ...trackedRows.map((row) => row.url).filter((url): url is string => Boolean(url)),
    ...eliminatedUrls,
  ]);
  const visible = filterOutUrls(results, excluded);

  // AI title suggestions are disabled by default; return an empty list so the
  // client renders a stable "no suggestions" state without an AI call.
  // titleAliases: the user's curated aliases for this keyword, so the client
  // can render them as removable chips without a second request.
  return NextResponse.json({ results: visible, suggestedTitles: [], titleAliases: userAliases });
}
