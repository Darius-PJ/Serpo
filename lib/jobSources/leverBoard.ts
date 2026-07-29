import { getSourceFetchTimeoutMs } from "./timeoutConfig";
import type { JobSearchCriteria, NormalizedJobListing } from "./types";

// Lever Postings API docs: https://github.com/lever/postings-api
// Public, unauthenticated, per-company. Returns a raw JSON array (not wrapped
// in an object) — verified against a live request, not assumed from docs.
interface LeverPosting {
  id: string;
  text: string;
  categories?: { location?: string; team?: string };
  hostedUrl: string;
  workplaceType?: "unspecified" | "on-site" | "remote" | "hybrid";
  descriptionPlain?: string;
  createdAt?: number; // unix ms, undocumented but present on live responses
}

export async function fetchLeverBoard(token: string, criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`, {
    signal: AbortSignal.timeout(getSourceFetchTimeoutMs()),
  });
  if (!res.ok) {
    throw new Error(`Lever board "${token}" search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as LeverPosting[];
  const keywords = criteria.keywords.toLowerCase();

  return data
    .filter((posting) => posting.text.toLowerCase().includes(keywords))
    .map((posting): NormalizedJobListing => ({
      id: `lever:${token}:${posting.id}`,
      source: `lever:${token}`,
      company: token,
      role: posting.text,
      location: posting.workplaceType === "remote" ? "Remote" : posting.categories?.location,
      url: posting.hostedUrl,
      postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : undefined,
      description: posting.descriptionPlain,
    }));
}
