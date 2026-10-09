// SmartRecruiters' public Posting API (https://developers.smartrecruiters.com/docs/posting-api):
// unauthenticated, per-company, newest first, paged with offset/limit (100 max per page).
// Large employers publish tens of thousands of postings (Domino's: ~25,000), so a search
// reads at most MAX_PAGES pages — the newest 1,000 postings. An unknown company
// identifier answers 200 with zero postings, never 404.
import { employmentTypeFromLabels } from "../../services/employmentLabels";
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface SmartRecruitersPosting {
  id: string;
  name: string;
  company?: { identifier?: string; name?: string };
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean; fullLocation?: string };
  typeOfEmployment?: { id?: string; label?: string };
  experienceLevel?: { id?: string; label?: string };
}

interface SmartRecruitersResponse {
  offset: number;
  limit: number;
  totalFound: number;
  content: SmartRecruitersPosting[];
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export const smartRecruitersAdapter: Adapter<SmartRecruitersPosting> = {
  metadata: {
    id: "smartrecruiters",
    displayName: "SmartRecruiters",
    homepage: "https://developers.smartrecruiters.com/docs/posting-api",
    tosNotes:
      "Public, unauthenticated, per-company Posting API intended for customer career sites. No keyword search here; reads the newest 1,000 postings per company.",
    sourceKind: "ats",
  },
  capabilities: {
    supportsKeywordQuery: false,
    supportsLocationFilter: false,
    supportsRemoteFilter: false,
    supportsDateFilter: false,
    supportsSalaryFilter: false,
    queryModel: "enumerate-target",
    paginationStyle: "offset",
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

  detectTarget(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (host === "careers.smartrecruiters.com" || host === "jobs.smartrecruiters.com") return segments[0] ?? null;
    if (host === "api.smartrecruiters.com" && segments[0] === "v1" && segments[1] === "companies") return segments[2] ?? null;
    return null;
  },

  async healthCheck(ctx) {
    try {
      const res = await fetchWithRetry("https://api.smartrecruiters.com/v1/companies/smartrecruiters/postings?limit=1", { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<SmartRecruitersPosting>> {
    if (query.kind !== "target") throw new Error("smartrecruiters requires a target query (a company identifier)");
    const token = query.target;

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      const res = await fetchWithRetry(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=${PAGE_SIZE}&offset=${offset}`,
        {},
        ctx
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: SmartRecruiters company "${token}" search failed`);
      const data = (await res.json()) as SmartRecruitersResponse;
      const next = offset + data.content.length;
      const hasMore = data.content.length === PAGE_SIZE && next < data.totalFound && page + 1 < MAX_PAGES;
      yield { items: data.content, nextCursor: hasMore ? String(next) : null, partial: false };
      if (!hasMore) return;
    }
  },

  normalize(posting, ctx: NormalizeContext): NormalizedJobListing {
    const token = ctx.query.kind === "target" ? ctx.query.target : "unknown";
    const location = posting.location;
    const country = location?.country && /^[a-z]{2}$/i.test(location.country) ? location.country.toUpperCase() : null;
    const experience = posting.experienceLevel;
    return {
      schemaVersion: 1,
      sourceId: `smartrecruiters:${token}`,
      sourceJobId: posting.id,
      idIsDerived: false,
      canonicalUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(token)}/${encodeURIComponent(posting.id)}`,
      applyUrl: null,
      title: posting.name,
      company: posting.company?.name ?? token,
      // The list endpoint carries no description; fetching each posting is not worth a request per job.
      descriptionHtml: null,
      descriptionText: null,
      postedAt: posting.releasedDate ?? null,
      fetchedAt: ctx.fetchedAt,
      location: {
        raw: location?.fullLocation ?? null,
        remote: location?.remote ?? null,
        country,
        region: location?.region ?? null,
        city: location?.city ?? null,
      },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: {
        type: employmentTypeFromLabels([posting.typeOfEmployment?.label]),
        seniorityHint: experience?.id && experience.id !== "not_applicable" ? (experience.label ?? null) : null,
      },
      // A company's own SmartRecruiters posting is definitionally never agency-posted.
      provenance: { sourceKind: "ats", posterIsLikelyAgency: false, originalSourceUrl: null },
      raw: posting,
    };
  },
};
