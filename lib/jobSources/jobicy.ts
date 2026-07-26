import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// Jobicy public API docs: https://jobicy.com/api/v2/remote-jobs
// No API key, but asks for attribution back to Jobicy.com — satisfied by this
// app's existing label + link-to-original-posting pattern for every connector.
// Remote-only by definition — remoteOnly criteria is always satisfied.
interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName?: string;
  jobGeo?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

export const jobicyConnector: JobSourceConnector = {
  key: "jobicy",
  label: "Jobicy",

  isConfigured() {
    return true;
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    const params = new URLSearchParams({ count: "25", tag: criteria.keywords });
    if (criteria.location) params.set("geo", criteria.location);

    const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Jobicy search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JobicyResponse;
    return data.jobs.map((job): NormalizedJobListing => ({
      id: `jobicy:${job.id}`,
      source: "jobicy",
      company: job.companyName ?? "Unknown",
      role: job.jobTitle,
      location: job.jobGeo ?? "Remote",
      url: job.url,
      postedAt: job.pubDate,
      description: job.jobDescription ?? job.jobExcerpt,
    }));
  },
};
