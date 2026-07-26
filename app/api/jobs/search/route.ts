import { NextResponse } from "next/server";
import { searchAllSources } from "@/lib/jobSources";
import { dedupeListings } from "@/lib/jobSources/dedupe";
import { rankJobResults } from "@/lib/ai/rankJobResults";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

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

  const results = await searchAllSources(criteria);
  const deduped = dedupeListings(results.flatMap((r) => r.listings));

  // The smart-ranking pass is a nice-to-have layered on top of already-working
  // search — never let it block or fail the underlying results, the same way
  // each connector already isolates its own errors from the rest of the search.
  let recommended: typeof deduped | undefined;
  let relatedSearchTerms: string[] | undefined;
  if (deduped.length > 0) {
    try {
      const ranked = await rankJobResults(criteria, deduped);
      const byId = new Map(deduped.map((listing) => [listing.id, listing]));
      recommended = ranked.recommendedIds.map((id) => byId.get(id)).filter((l) => l !== undefined);
      relatedSearchTerms = ranked.relatedSearchTerms;
    } catch {
      // Fall back silently — results (below) are still complete and useful.
    }
  }

  return NextResponse.json({ results, recommended, relatedSearchTerms });
}
