import { getSourceFetchTimeoutMs } from "./timeoutConfig";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// Adzuna API docs: https://developer.adzuna.com/docs/search
interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
  created?: string;
  description?: string;
}

interface AdzunaResponse {
  results: AdzunaResult[];
}

const COUNTRY = "us";

export const adzunaConnector: JobSourceConnector = {
  key: "adzuna",
  label: "Adzuna",

  isConfigured() {
    return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      what: criteria.keywords,
      results_per_page: "20",
    });
    if (criteria.location) params.set("where", criteria.location);

    const res = await fetch(
      `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1?${params.toString()}`,
      { signal: AbortSignal.timeout(getSourceFetchTimeoutMs()) }
    );

    if (!res.ok) {
      throw new Error(`Adzuna search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as AdzunaResponse;
    return data.results.map((item): NormalizedJobListing => ({
      id: `adzuna:${item.id}`,
      source: "adzuna",
      company: item.company?.display_name ?? "Unknown",
      role: item.title,
      location: item.location?.display_name,
      url: item.redirect_url,
      postedAt: item.created,
      description: item.description,
    }));
  },
};
