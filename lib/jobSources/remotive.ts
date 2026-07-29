import { getSourceFetchTimeoutMs } from "./timeoutConfig";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// Remotive public API docs: https://github.com/remotive-com/remote-jobs-api
// No API key. Remote-only by definition — remoteOnly criteria is always satisfied.
// ToS asks that results link back to Remotive and are attributed as the source,
// which every connector in this app already does (label + link to the original URL).
// Remotive asks API consumers to stay under ~2 requests/minute — fine here since
// this connector fires at most once per user-initiated search.
interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name?: string;
  category?: string;
  publication_date?: string;
  candidate_required_location?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

export const remotiveConnector: JobSourceConnector = {
  key: "remotive",
  label: "Remotive",

  isConfigured() {
    return true;
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    const params = new URLSearchParams({ search: criteria.keywords, limit: "25" });

    const res = await fetch(`https://remotive.com/api/remote-jobs?${params.toString()}`, {
      signal: AbortSignal.timeout(getSourceFetchTimeoutMs()),
    });
    if (!res.ok) {
      throw new Error(`Remotive search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as RemotiveResponse;
    return data.jobs.map((job): NormalizedJobListing => ({
      id: `remotive:${job.id}`,
      source: "remotive",
      company: job.company_name ?? "Unknown",
      role: job.title,
      location: job.candidate_required_location ?? "Remote",
      url: job.url,
      postedAt: job.publication_date,
      description: job.description,
    }));
  },
};
