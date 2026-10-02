import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { parseJobSearchCriteria } from "@/lib/jobSources/runJobSearch";
import { CADENCES, isCadence } from "@/lib/automation/cadence";
import { createSavedSearch, SavedSearchInputError } from "@/lib/savedSearches/savedSearches";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  // The same criteria shape the search form posts to /api/jobs/search.
  const criteria = parseJobSearchCriteria(body);
  if (!criteria) {
    return NextResponse.json({ error: "keywords is required" }, { status: 400 });
  }
  if (!isCadence(body.cadence)) {
    return NextResponse.json({ error: `cadence must be one of ${CADENCES.map((c) => c.value).join(", ")}` }, { status: 400 });
  }

  try {
    const savedSearch = await createSavedSearch(userId, {
      name: typeof body.name === "string" ? body.name : "",
      criteria,
      cadence: body.cadence,
    });
    return NextResponse.json({ savedSearch }, { status: 201 });
  } catch (err) {
    if (err instanceof SavedSearchInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
