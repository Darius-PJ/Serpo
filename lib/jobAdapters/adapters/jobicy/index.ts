// Migrated from lib/jobSources/jobicy.ts (kept, untouched, as the legacy path).
import { employmentTypeFromLabels } from "../../services/employmentLabels";
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName?: string;
  jobGeo?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  // e.g. ["Full-Time"], ["Contract"]. The JSON API takes no job-type param (only its
  // RSS feed does), and 400s on unknown params such as jobType.
  jobType?: string[];
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

export const jobicyAdapter: Adapter<JobicyJob> = {
  metadata: {
    id: "jobicy",
    displayName: "Jobicy",
    homepage: "https://jobicy.com/api/v2/remote-jobs",
    tosNotes: "Public feed, no API key, asks for attribution back to Jobicy.com. Remote-only by definition. `geo` only accepts region enum values and 400s on free text (verified live).",
    sourceKind: "aggregator",
  },
  capabilities: {
    // Unlike Himalayas, Jobicy's `tag` param was live-verified in Phase 1 to
    // genuinely filter server-side (a clean typical/empty/error fixture triad) —
    // tests/fixtures/jobicy/empty.json is a real, verified empty result.
    supportsKeywordQuery: true,
    supportsLocationFilter: false,
    supportsRemoteFilter: true,
    supportsDateFilter: false,
    supportsSalaryFilter: false,
    queryModel: "keyword-search",
    paginationStyle: "none",
    requiresDetailFetch: false,
    runtime: "node",
    cost: { tier: "free" },
    latencyClass: "fast",
    cacheable: true,
    cacheTtlSeconds: 900,
    tosForbidsStorage: false,
    maxConcurrency: 5,
  },
  configSchema: [],
  isConfigured: () => true,

  async healthCheck(ctx) {
    try {
      const res = await fetchWithRetry("https://jobicy.com/api/v2/remote-jobs?count=1&tag=engineer", { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<JobicyJob>> {
    const keywords = query.kind === "keywords" ? query.keywords : "";
    const params = new URLSearchParams({ count: "25", tag: keywords });
    const res = await fetchWithRetry(`https://jobicy.com/api/v2/remote-jobs?${params}`, {}, ctx);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Jobicy search failed`);
    const data = (await res.json()) as JobicyResponse;
    yield { items: data.jobs, nextCursor: null, partial: false };
  },

  normalize(job, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: "jobicy",
      sourceJobId: String(job.id),
      idIsDerived: false,
      canonicalUrl: job.url,
      applyUrl: null,
      title: job.jobTitle,
      company: job.companyName ?? null,
      descriptionHtml: null,
      descriptionText: job.jobDescription ?? job.jobExcerpt ?? null,
      postedAt: job.pubDate ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: job.jobGeo ?? "Remote", remote: true, country: null, region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: employmentTypeFromLabels(job.jobType ?? []), seniorityHint: null },
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: job,
    };
  },
};
