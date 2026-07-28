import { NextResponse } from "next/server";
import { searchAllSources } from "@/lib/jobSources";
import { searchPoolBoards } from "@/lib/jobSources/searchPoolBoards";
import { dedupeListings } from "@/lib/jobSources/dedupe";
import { matchesExactTitle, isSeniorTitle } from "@/lib/jobSources/titleMatch";
import { isUsOrRemoteListing, isRemoteListing } from "@/lib/jobSources/locationFilter";
import { suggestJobTitles } from "@/lib/ai/suggestJobTitles";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();
  const keywords = typeof body.keywords === "string" ? body.keywords.slice(0, MAX_FIELD_LENGTH) : "";
  if (!keywords.trim()) {
    return NextResponse.json({ error: "keywords is required" }, { status: 400 });
  }

  const criteria = {
    keywords,
    location: typeof body.location === "string" ? body.location.slice(0, MAX_FIELD_LENGTH) : undefined,
    remoteOnly: Boolean(body.remoteOnly),
  };

  const [staticResults, poolResults] = await Promise.all([
    searchAllSources(criteria),
    searchPoolBoards(userId, criteria),
  ]);

  // Uniform post-fetch filtering regardless of how fuzzy each upstream API's
  // own "search" param happened to be: exact title-phrase match, entry/mid
  // level only, and US-or-remote (stricter remote-only on top when asked).
  const filteredGroups = [...staticResults, ...poolResults].map((group) => ({
    ...group,
    listings: group.listings.filter(
      (listing) =>
        matchesExactTitle(listing.role, criteria.keywords) &&
        !isSeniorTitle(listing.role) &&
        isUsOrRemoteListing(listing) &&
        (!criteria.remoteOnly || isRemoteListing(listing))
    ),
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

  let suggestedTitles: string[] | undefined;
  try {
    suggestedTitles = await suggestJobTitles(criteria.keywords);
  } catch {
    // Fail soft — results above are already complete and useful without this.
  }

  return NextResponse.json({ results, suggestedTitles });
}
