import { NextResponse } from "next/server";
import { parseJobSearchCriteria, runJobSearch } from "@/lib/jobSources/runJobSearch";
import { recordSearch } from "@/lib/companies/searchHistory";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const criteria = parseJobSearchCriteria(await request.json().catch(() => ({})));
  if (!criteria) {
    return NextResponse.json({ error: "keywords is required" }, { status: 400 });
  }

  // Only searches run by hand reach this route; saved-search runs call runJobSearch directly.
  await recordSearch(userId, criteria.keywords, criteria.location);
  const { results, titleAliases } = await runJobSearch(userId, criteria);

  // AI title suggestions are disabled by default; return an empty list so the
  // client renders a stable "no suggestions" state without an AI call.
  // titleAliases: the user's curated aliases for this keyword, so the client
  // can render them as removable chips without a second request.
  return NextResponse.json({ results, suggestedTitles: [], titleAliases });
}
