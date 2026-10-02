// Migrated from lib/jobSources/jooble.ts (kept, untouched, as the legacy path).
import { employmentTypeFromLabels } from "../../services/employmentLabels";
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface JoobleJob {
  id: string | number;
  title: string;
  company?: string;
  location?: string;
  link: string;
  snippet?: string;
  updated?: string;
  // "Full-time", "Part-time", ... — or "" for most jobs (tests/fixtures/jooble/typical.json).
  type?: string;
}

interface JoobleResponse {
  jobs: JoobleJob[];
}

export const joobleAdapter: Adapter<JoobleJob> = {
  metadata: {
    id: "jooble",
    displayName: "Jooble",
    homepage: "https://jooble.org/api/about",
    tosNotes: "Free instant self-serve API key. A genuine aggregator-of-aggregators covering many countries/sources.",
    sourceKind: "aggregator",
  },
  capabilities: {
    supportsKeywordQuery: true,
    supportsLocationFilter: true,
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
  configSchema: [{ envVar: "JOOBLE_API_KEY", required: true, description: "Jooble API key (free instant self-serve signup)" }],
  isConfigured: () => Boolean(process.env.JOOBLE_API_KEY),

  async healthCheck(ctx) {
    try {
      const res = await fetchWithRetry(
        `https://jooble.org/api/${process.env.JOOBLE_API_KEY}`,
        { method: "POST", maxRetries: 0, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: "engineer" }) },
        ctx
      );
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<JoobleJob>> {
    if (query.kind !== "keywords") throw new Error("jooble requires a keyword query");

    // Jooble's request body has no job-type field, so a contract search relies on each
    // job's own `type`. It has no structured "remote" field either — closest available
    // signal is passing "Remote" as the location when remoteOnly is asked for and no
    // location was given.
    const location = query.location ?? (query.remoteOnly ? "Remote" : undefined);

    const res = await fetchWithRetry(
      `https://jooble.org/api/${process.env.JOOBLE_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: query.keywords, location }) },
      ctx
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: Jooble search failed`);
    const data = (await res.json()) as JoobleResponse;
    yield { items: data.jobs ?? [], nextCursor: null, partial: false };
  },

  normalize(job, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: "jooble",
      sourceJobId: String(job.id),
      idIsDerived: false,
      canonicalUrl: job.link,
      applyUrl: null,
      title: job.title,
      company: job.company ?? null,
      descriptionHtml: null,
      descriptionText: job.snippet ?? null,
      postedAt: job.updated ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: job.location ?? null, remote: null, country: null, region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: employmentTypeFromLabels([job.type]), seniorityHint: null },
      // No reliable per-listing signal — left null so dedupe's generic
      // company-name heuristic (lib/jobSources/staffingAgencies.ts) is the fallback,
      // same as every other genuine aggregator here.
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: job,
    };
  },
};
