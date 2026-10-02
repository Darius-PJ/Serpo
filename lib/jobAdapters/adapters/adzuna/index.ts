// Migrated from lib/jobSources/adzuna.ts (kept, untouched, as the legacy path).
// Third source group, second half: multi-country (hardcoded to "us" here, same as
// legacy), quota-limited, real page-numbered pagination — the other structurally
// distinct case the task's migration order calls for alongside RemoteOK.
import { employmentTypeFromLabels } from "../../services/employmentLabels";
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
  created?: string;
  description?: string;
  contract_type?: "permanent" | "contract";
  contract_time?: "full_time" | "part_time";
}

interface AdzunaResponse {
  results: AdzunaResult[];
}

const COUNTRY = "us";

export const adzunaAdapter: Adapter<AdzunaResult> = {
  metadata: {
    id: "adzuna",
    displayName: "Adzuna",
    homepage: "https://developer.adzuna.com/docs/search",
    tosNotes: "Requires an app_id + app_key. Real-world free tier has a daily call quota (exact figure not verified against this repo's own docs — Phase 1 didn't need to spend quota confirming it).",
    sourceKind: "aggregator",
  },
  capabilities: {
    supportsKeywordQuery: true,
    supportsLocationFilter: true,
    supportsRemoteFilter: false,
    supportsDateFilter: false,
    supportsSalaryFilter: false,
    queryModel: "keyword-search",
    // Adzuna's own API is genuinely page-numbered — declared honestly even though
    // this adapter (like the legacy connector) still only walks page 1 today. Multi-
    // page walking is a natural follow-up the async-generator shape enables for
    // free, deliberately not attempted in this pass without a test suite to verify
    // it against.
    paginationStyle: "page",
    requiresDetailFetch: false,
    runtime: "node",
    cost: { tier: "quota-limited", quotaUnit: "calls", interval: "day" },
    latencyClass: "fast",
    cacheable: true,
    cacheTtlSeconds: 900,
    tosForbidsStorage: false,
    maxConcurrency: 3,
  },
  configSchema: [
    { envVar: "ADZUNA_APP_ID", required: true, description: "Adzuna application id" },
    { envVar: "ADZUNA_APP_KEY", required: true, description: "Adzuna application key" },
  ],
  isConfigured: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),

  async healthCheck(ctx) {
    try {
      const params = new URLSearchParams({
        app_id: process.env.ADZUNA_APP_ID!,
        app_key: process.env.ADZUNA_APP_KEY!,
        what: "engineer",
        results_per_page: "1",
      });
      const res = await fetchWithRetry(`https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1?${params}`, { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<AdzunaResult>> {
    if (query.kind !== "keywords") throw new Error("adzuna requires a keyword query");

    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      what: query.keywords,
      results_per_page: "20",
    });
    if (query.location) params.set("where", query.location);
    // Adzuna's contract=1 matches contract_type "contract"; it has no temporary type.
    if (query.employmentType === "contract") params.set("contract", "1");

    const res = await fetchWithRetry(`https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1?${params}`, {}, ctx);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Adzuna search failed`);
    const data = (await res.json()) as AdzunaResponse;
    yield { items: data.results, nextCursor: null, partial: false };
  },

  normalize(item, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: "adzuna",
      sourceJobId: item.id,
      idIsDerived: false,
      canonicalUrl: item.redirect_url,
      applyUrl: null,
      title: item.title,
      company: item.company?.display_name ?? null,
      descriptionHtml: null,
      descriptionText: item.description ?? null,
      postedAt: item.created ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: item.location?.display_name ?? null, remote: null, country: "US", region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: employmentType(item, ctx.query), seniorityHint: null },
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: item,
    };
  },
};

function employmentType(item: AdzunaResult, query: NormalizeContext["query"]): NormalizedJobListing["employment"]["type"] {
  // contract=1 filters on contract_type, so a filtered result that omits it is still
  // Adzuna's own contract assertion. contract_time is only full/part time.
  if (!item.contract_type && query.kind === "keywords" && query.employmentType === "contract") return "contract";
  return employmentTypeFromLabels([item.contract_type, item.contract_time]);
}
