import { getSourceFetchTimeoutMs } from "./timeoutConfig";
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
    // `geo` only accepts a small set of region enum values (e.g. "usa",
    // "europe"), not free text — verified live that a free-text location
    // (e.g. "Austin, Texas") 400s here while omitting the param entirely
    // succeeds. Not worth mapping our free-text location field to an enum:
    // this source is remote-only by definition, so this app's own
    // isUsOrRemoteListing post-filter already covers it.
    const params = new URLSearchParams({ count: "25", tag: criteria.keywords });

    const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?${params.toString()}`, {
      signal: AbortSignal.timeout(getSourceFetchTimeoutMs()),
    });
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
