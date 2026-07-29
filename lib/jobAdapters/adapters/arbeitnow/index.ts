// Migrated from lib/jobSources/arbeitnow.ts (kept, untouched, as the legacy path).
// First source migrated, per the task's own migration order: simplest source, proves
// the plumbing.
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

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

export const arbeitnowAdapter: Adapter<ArbeitnowJob> = {
  metadata: {
    id: "arbeitnow",
    displayName: "Arbeitnow",
    homepage: "https://www.arbeitnow.com",
    tosNotes: "Public feed, no API key. Europe/remote-focused, includes a visa_sponsorship signal.",
    sourceKind: "aggregator",
  },
  capabilities: {
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
      const res = await fetchWithRetry("https://www.arbeitnow.com/api/job-board-api", { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<ArbeitnowJob>> {
    const res = await fetchWithRetry("https://www.arbeitnow.com/api/job-board-api", {}, ctx);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Arbeitnow search failed`);
    const data = (await res.json()) as ArbeitnowResponse;

    // No local keyword filter here (unlike the legacy connector) — this adapter's
    // supportsKeywordQuery: false + queryModel: "full-dump" already tells
    // orchestration not to trust upstream/adapter-side filtering, and
    // app/api/jobs/search/route.ts already re-filters every source's listings
    // uniformly after merge. Only the remote-only structural filter (which isn't a
    // keyword match, it's a real boolean field) stays.
    const remoteOnly = query.kind === "keywords" && query.remoteOnly;
    const items = data.data.filter((job) => !remoteOnly || job.remote);
    yield { items, nextCursor: null, partial: false };
  },

  normalize(job, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: "arbeitnow",
      sourceJobId: job.slug,
      idIsDerived: false,
      canonicalUrl: job.url,
      applyUrl: null,
      title: job.title,
      company: job.company_name ?? null,
      descriptionHtml: null,
      descriptionText: job.description ?? null,
      postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
      fetchedAt: ctx.fetchedAt,
      location: {
        raw: job.remote ? "Remote" : (job.location ?? null),
        remote: job.remote ?? null,
        country: null,
        region: null,
        city: null,
      },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: null, seniorityHint: null },
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: job,
    };
  },
};
