import { getSourceFetchTimeoutMs } from "./timeoutConfig";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// Himalayas public API docs: https://himalayas.app/docs/remote-jobs-api
// No API key. Remote-only by definition — remoteOnly criteria is always satisfied.
interface HimalayasJob {
  title: string;
  guid: string;
  companyName?: string;
  locationRestrictions?: { alpha2: string; name: string }[];
  description?: string;
  excerpt?: string;
  pubDate?: string;
  applicationLink: string;
}

interface HimalayasSearchResponse {
  jobs: HimalayasJob[];
}

export const himalayasConnector: JobSourceConnector = {
  key: "himalayas",
  label: "Himalayas",

  isConfigured() {
    return true;
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    // `country` only accepts an ISO country code, not free text — verified
    // live that a free-text location (e.g. "Austin, Texas") 400s here while
    // omitting the param entirely succeeds. Not worth mapping our free-text
    // location field to a code: this source is remote-only by definition, so
    // this app's own isUsOrRemoteListing post-filter already covers it.
    const params = new URLSearchParams({ q: criteria.keywords });

    const res = await fetch(`https://himalayas.app/jobs/api/search?${params.toString()}`, {
      signal: AbortSignal.timeout(getSourceFetchTimeoutMs()),
    });
    if (!res.ok) {
      throw new Error(`Himalayas search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as HimalayasSearchResponse;
    return data.jobs.map((job): NormalizedJobListing => ({
      id: `himalayas:${job.guid}`,
      source: "himalayas",
      company: job.companyName ?? "Unknown",
      role: job.title,
      location: job.locationRestrictions?.length ? job.locationRestrictions.map((l) => l.name).join(", ") : "Remote",
      url: job.applicationLink,
      postedAt: job.pubDate,
      description: job.description ?? job.excerpt,
    }));
  },
};
