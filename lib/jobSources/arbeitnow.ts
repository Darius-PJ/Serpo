import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// Arbeitnow public API docs: https://www.arbeitnow.com/api/job-board-api
// No API key. Europe/remote-focused, includes a visa_sponsorship signal.
// The API returns a feed rather than accepting a keyword query, so — same
// pattern as remoteOk.ts — keyword matching happens locally.
interface ArbeitnowJob {
  slug: string;
  title: string;
  company_name?: string;
  location?: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  description?: string;
  created_at?: number; // unix seconds
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
}

export const arbeitnowConnector: JobSourceConnector = {
  key: "arbeitnow",
  label: "Arbeitnow",

  isConfigured() {
    return true;
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    const res = await fetch("https://www.arbeitnow.com/api/job-board-api");
    if (!res.ok) {
      throw new Error(`Arbeitnow search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as ArbeitnowResponse;
    const keywords = criteria.keywords.toLowerCase();

    return data.data
      .filter((job) => !criteria.remoteOnly || job.remote)
      .filter((job) => {
        const haystack = [job.title, job.company_name, ...(job.tags ?? [])].join(" ").toLowerCase();
        return haystack.includes(keywords);
      })
      .map((job): NormalizedJobListing => ({
        id: `arbeitnow:${job.slug}`,
        source: "arbeitnow",
        company: job.company_name ?? "Unknown",
        role: job.title,
        location: job.remote ? "Remote" : job.location,
        url: job.url,
        postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : undefined,
        description: job.description,
      }));
  },
};
