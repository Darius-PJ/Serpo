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
    // Only the Codes are reliable: agencies fill Name with free text or leave it ""
    // (tests/fixtures/usajobs/contract-filter.json).
    PositionOfferingType?: { Name: string; Code: string }[];
    PositionSchedule?: { Name: string; Code: string }[];
  };
}

interface UsaJobsResponse {
  SearchResult: { SearchResultItems: UsaJobsSearchResultItem[] };
}

// PositionOfferingType codes for time-limited appointments
// (https://data.usajobs.gov/api/codelist/positionofferingtypes): Temporary and Term.
// USAJobs lists federal appointments, not contracts, so these are what a contract search can mean here.
const TIME_LIMITED_OFFERING_CODES = ["15318", "15319"];

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
    if (query.employmentType === "contract") params.set("PositionOfferingTypeCode", TIME_LIMITED_OFFERING_CODES.join(";"));

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
      employment: { type: employmentType(d, ctx.query), seniorityHint: null },
      // Every USAJobs posting is a federal agency hiring directly — never a
      // third-party staffing agency, a fact this adapter can declare with certainty
      // rather than leaving it to dedupe's generic name-heuristic fallback.
      provenance: { sourceKind: "direct-employer", posterIsLikelyAgency: false, originalSourceUrl: null },
      raw: item,
    };
  },
};

function employmentType(
  d: UsaJobsSearchResultItem["MatchedObjectDescriptor"],
  query: NormalizeContext["query"]
): NormalizedJobListing["employment"]["type"] {
  const offerings = d.PositionOfferingType ?? [];
  if (offerings.some((o) => TIME_LIMITED_OFFERING_CODES.includes(o.Code))) return "temporary";
  // A result of the PositionOfferingTypeCode filter is USAJobs' own time-limited assertion.
  if (offerings.length === 0 && query.kind === "keywords" && query.employmentType === "contract") return "temporary";
  // PositionScheduleTypeCode: 1 Full-Time, 2 Part-Time (the rest are shift/intermittent/job-sharing/multiple).
  const schedules = (d.PositionSchedule ?? []).map((s) => s.Code);
  if (schedules.includes("1")) return "full-time";
  if (schedules.includes("2")) return "part-time";
  return null;
}
