// Migrated from lib/jobSources/remotive.ts (kept, untouched, as the legacy path).
import { employmentTypeFromLabels } from "../../services/employmentLabels";
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name?: string;
  category?: string;
  publication_date?: string;
  candidate_required_location?: string;
  description?: string;
  // "full_time" | "part_time" | "contract" | "freelance" | "internship" | "" ... — the
  // API has no job-type request param (job_type=contract was ignored when tried live).
  job_type?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

export const remotiveAdapter: Adapter<RemotiveJob> = {
  metadata: {
    id: "remotive",
    displayName: "Remotive",
    homepage: "https://remotive.com",
    tosNotes:
      "Public feed, no API key. Asks consumers to stay under ~2 requests/minute (not enforced in code). Remote-only by definition.",
    sourceKind: "aggregator",
  },
  capabilities: {
    // Live-verified in Phase 1 that `search` doesn't reliably filter server-side (a
    // nonsense keyword returned the identical job set) — see
    // tests/fixtures/remotive/FINDING-search-param-not-filtering.json. Declared
    // false so nothing downstream trusts a filter this API doesn't actually perform,
    // even though the param is still sent (matches legacy, doesn't hurt).
    supportsKeywordQuery: false,
    supportsLocationFilter: false,
    supportsRemoteFilter: true,
    supportsDateFilter: false,
    supportsSalaryFilter: false,
    queryModel: "full-dump",
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
      const res = await fetchWithRetry("https://remotive.com/api/remote-jobs?limit=1", { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<RemotiveJob>> {
    const keywords = query.kind === "keywords" ? query.keywords : "";
    const params = new URLSearchParams({ search: keywords, limit: "25" });
    const res = await fetchWithRetry(`https://remotive.com/api/remote-jobs?${params}`, {}, ctx);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Remotive search failed`);
    const data = (await res.json()) as RemotiveResponse;
    yield { items: data.jobs, nextCursor: null, partial: false };
  },

  normalize(job, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: "remotive",
      sourceJobId: String(job.id),
      idIsDerived: false,
      canonicalUrl: job.url,
      applyUrl: null,
      title: job.title,
      company: job.company_name ?? null,
      descriptionHtml: null,
      descriptionText: job.description ?? null,
      postedAt: job.publication_date ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: job.candidate_required_location ?? "Remote", remote: true, country: null, region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: employmentTypeFromLabels([job.job_type]), seniorityHint: null },
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: job,
    };
  },
};
