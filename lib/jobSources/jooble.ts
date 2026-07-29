import { getSourceFetchTimeoutMs } from "./timeoutConfig";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// Jooble REST API docs: https://jooble.org/api/about
// Free API key via instant self-serve signup (no card) — set JOOBLE_API_KEY.
// A genuine aggregator-of-aggregators covering many countries/sources, so this
// is the single broadest connector available without an enterprise partnership.
interface JoobleJob {
  id: string | number;
  title: string;
  company?: string;
  location?: string;
  link: string;
  snippet?: string;
  updated?: string;
}

interface JoobleResponse {
  jobs: JoobleJob[];
}

export const joobleConnector: JobSourceConnector = {
  key: "jooble",
  label: "Jooble",

  isConfigured() {
    return Boolean(process.env.JOOBLE_API_KEY);
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    // Jooble has no structured "remote" field in this response shape — the
    // closest available signal is passing "Remote" as the location when the
    // user asked for remote-only and gave no location of their own.
    const location = criteria.location ?? (criteria.remoteOnly ? "Remote" : undefined);

    const res = await fetch(`https://jooble.org/api/${process.env.JOOBLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: criteria.keywords, location }),
      signal: AbortSignal.timeout(getSourceFetchTimeoutMs()),
    });

    if (!res.ok) {
      throw new Error(`Jooble search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JoobleResponse;
    return (data.jobs ?? []).map((job): NormalizedJobListing => ({
      id: `jooble:${job.id}`,
      source: "jooble",
      company: job.company ?? "Unknown",
      role: job.title,
      location: job.location,
      url: job.link,
      postedAt: job.updated,
      description: job.snippet,
    }));
  },
};
