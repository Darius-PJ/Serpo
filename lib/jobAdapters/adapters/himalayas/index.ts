// Migrated from lib/jobSources/himalayas.ts (kept, untouched, as the legacy path).
import { employmentTypeFromLabels } from "../../services/employmentLabels";
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface HimalayasJob {
  title: string;
  guid: string;
  companyName?: string;
  locationRestrictions?: { alpha2: string; name: string }[];
  description?: string;
  excerpt?: string;
  pubDate?: string;
  applicationLink: string;
  // "Full Time" | "Part Time" | "Contractor" | "Temporary" | "Intern" | "Volunteer" | "Other"
  employmentType?: string;
}

interface HimalayasSearchResponse {
  jobs: HimalayasJob[];
}

export const himalayasAdapter: Adapter<HimalayasJob> = {
  metadata: {
    id: "himalayas",
    displayName: "Himalayas",
    homepage: "https://himalayas.app/docs/remote-jobs-api",
    tosNotes: "Public feed, no API key. Remote-only by definition. `country` param only accepts ISO codes and 400s on free text (verified live).",
    sourceKind: "aggregator",
  },
  capabilities: {
    // Live-verified in Phase 1 that `q` doesn't reliably filter server-side (a
    // nonsense keyword returned 19 unrelated real jobs) — see
    // tests/fixtures/himalayas/FINDING-search-param-not-filtering.json.
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
      const res = await fetchWithRetry("https://himalayas.app/jobs/api/search?q=engineer", { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<HimalayasJob>> {
    const keywords = query.kind === "keywords" ? query.keywords : "";
    // `country`/`location` deliberately never sent — see tosNotes; this app's own
    // uniform post-filter (isUsOrRemoteListing) covers it instead, same as legacy.
    const params = new URLSearchParams({ q: keywords });
    // Unlike `q`, employment_type was live-verified to filter: comma-separated values
    // are ORed (Contractor 2195 + Temporary 29 = 2224 total for q=engineer, 2026-09-27).
    if (query.kind === "keywords" && query.employmentType === "contract") params.set("employment_type", "Contractor,Temporary");
    const res = await fetchWithRetry(`https://himalayas.app/jobs/api/search?${params}`, {}, ctx);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Himalayas search failed`);
    const data = (await res.json()) as HimalayasSearchResponse;
    yield { items: data.jobs, nextCursor: null, partial: false };
  },

  normalize(job, ctx: NormalizeContext): NormalizedJobListing {
    const locationRaw = job.locationRestrictions?.length ? job.locationRestrictions.map((l) => l.name).join(", ") : "Remote";
    return {
      schemaVersion: 1,
      sourceId: "himalayas",
      sourceJobId: job.guid,
      idIsDerived: false,
      canonicalUrl: job.applicationLink,
      applyUrl: null,
      title: job.title,
      company: job.companyName ?? null,
      descriptionHtml: null,
      descriptionText: job.description ?? job.excerpt ?? null,
      postedAt: job.pubDate ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: locationRaw, remote: true, country: null, region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: employmentTypeFromLabels([job.employmentType]), seniorityHint: null },
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: job,
    };
  },
};
