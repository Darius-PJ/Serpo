// Migrated from lib/jobSources/usaJobs.ts (kept, untouched, as the legacy path).
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface UsaJobsSearchResultItem {
  MatchedObjectDescriptor: {
    PositionID: string;
    PositionTitle: string;
    PositionURI: string;
    OrganizationName: string;
    PositionLocationDisplay?: string;
    PublicationStartDate?: string;
    UserArea?: { Details?: { JobSummary?: string } };
  };
}

interface UsaJobsResponse {
  SearchResult: { SearchResultItems: UsaJobsSearchResultItem[] };
}

export const usaJobsAdapter: Adapter<UsaJobsSearchResultItem> = {
  metadata: {
    id: "usajobs",
    displayName: "USAJobs",
    homepage: "https://developer.usajobs.gov/api-reference/get-api-search",
    tosNotes: "Requires an API key + a User-Agent set to the email address registered against that key.",
    // Not "aggregator" despite spanning many agencies: every individual posting is a
    // federal agency hiring directly, never a third-party repost — see normalize()'s
    // identical reasoning for posterIsLikelyAgency.
    sourceKind: "direct-employer",
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
  configSchema: [
    { envVar: "USAJOBS_API_KEY", required: true, description: "USAJobs API key" },
    { envVar: "USAJOBS_USER_AGENT", required: true, description: "Email address registered against USAJOBS_API_KEY" },
  ],
  isConfigured: () => Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_USER_AGENT),

  async healthCheck(ctx) {
    try {
      const res = await fetchWithRetry(
        "https://data.usajobs.gov/api/search?Keyword=engineer",
        {
          maxRetries: 0,
          headers: { Host: "data.usajobs.gov", "User-Agent": process.env.USAJOBS_USER_AGENT!, "Authorization-Key": process.env.USAJOBS_API_KEY! },
        },
        ctx
      );
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<UsaJobsSearchResultItem>> {
    if (query.kind !== "keywords") throw new Error("usajobs requires a keyword query");

    const params = new URLSearchParams({ Keyword: query.keywords });
    if (query.location) params.set("LocationName", query.location);
    if (query.remoteOnly) params.set("RemoteIndicator", "true");

    const res = await fetchWithRetry(
      `https://data.usajobs.gov/api/search?${params}`,
      { headers: { Host: "data.usajobs.gov", "User-Agent": process.env.USAJOBS_USER_AGENT!, "Authorization-Key": process.env.USAJOBS_API_KEY! } },
      ctx
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: USAJobs search failed`);
    const data = (await res.json()) as UsaJobsResponse;
    yield { items: data.SearchResult.SearchResultItems, nextCursor: null, partial: false };
  },

  normalize(item, ctx: NormalizeContext): NormalizedJobListing {
    const d = item.MatchedObjectDescriptor;
    return {
      schemaVersion: 1,
      sourceId: "usajobs",
      sourceJobId: d.PositionID,
      idIsDerived: false,
      canonicalUrl: d.PositionURI,
      applyUrl: null,
      title: d.PositionTitle,
      company: d.OrganizationName,
      descriptionHtml: null,
      descriptionText: d.UserArea?.Details?.JobSummary ?? null,
      postedAt: d.PublicationStartDate ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: d.PositionLocationDisplay ?? null, remote: null, country: "US", region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: null, seniorityHint: null },
      // Every USAJobs posting is a federal agency hiring directly — never a
      // third-party staffing agency, a fact this adapter can declare with certainty
      // rather than leaving it to dedupe's generic name-heuristic fallback.
      provenance: { sourceKind: "direct-employer", posterIsLikelyAgency: false, originalSourceUrl: null },
      raw: item,
    };
  },
};
