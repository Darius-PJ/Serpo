import type { JobSearchCriteria, NormalizedJobListing } from "./types";

// Greenhouse Job Board API docs: https://developers.greenhouse.io/job-board.html
// Public, unauthenticated, per-company. No native keyword search — filtered
// locally, same pattern as remoteOk.ts/arbeitnow.ts.
interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export async function fetchGreenhouseBoard(
  token: string,
  criteria: JobSearchCriteria
): Promise<NormalizedJobListing[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
  if (!res.ok) {
    throw new Error(`Greenhouse board "${token}" search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GreenhouseResponse;
  const keywords = criteria.keywords.toLowerCase();

  return data.jobs
    .filter((job) => job.title.toLowerCase().includes(keywords))
    .map((job): NormalizedJobListing => ({
      id: `greenhouse:${token}:${job.id}`,
      source: `greenhouse:${token}`,
      company: token,
      role: job.title,
      location: job.location?.name,
      url: job.absolute_url,
      postedAt: job.updated_at,
      description: job.content,
    }));
}
