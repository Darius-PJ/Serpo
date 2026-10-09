// Ashby's public Job Postings API (https://developers.ashbyhq.com/docs/public-job-posting-api):
// one unauthenticated GET returns every published posting for one company's job board.
// Same enumerate-target shape as Greenhouse/Lever; the board name is the target.
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface AshbySalaryComponent {
  compensationType?: string;
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string | null;
  employmentType?: string | null;
  isRemote?: boolean | null;
  isListed?: boolean;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  publishedAt?: string | null;
  jobUrl: string;
  applyUrl?: string | null;
  address?: { postalAddress?: { addressLocality?: string; addressRegion?: string } } | null;
  compensation?: { summaryComponents?: AshbySalaryComponent[] } | null;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

const EMPLOYMENT_TYPES: Record<string, NormalizedJobListing["employment"]["type"]> = {
  FullTime: "full-time",
  PartTime: "part-time",
  Contract: "contract",
  Temporary: "temporary",
};

const SALARY_PERIODS: Record<string, NormalizedJobListing["compensation"]["period"]> = {
  "1 YEAR": "year",
  "1 MONTH": "month",
  "1 DAY": "day",
  "1 HOUR": "hour",
};

function compensation(job: AshbyJob): NormalizedJobListing["compensation"] {
  const salary = job.compensation?.summaryComponents?.find((component) => component.compensationType === "Salary");
  if (!salary) return { min: null, max: null, currency: null, period: null, isEstimate: false };
  return {
    min: salary.minValue ?? null,
    max: salary.maxValue ?? null,
    currency: salary.currencyCode ?? null,
    period: SALARY_PERIODS[salary.interval ?? ""] ?? null,
    isEstimate: false,
  };
}

export const ashbyAdapter: Adapter<AshbyJob> = {
  metadata: {
    id: "ashby",
    displayName: "Ashby",
    homepage: "https://developers.ashbyhq.com/docs/public-job-posting-api",
    tosNotes:
      "Public, unauthenticated, per-company board API intended for careers pages. No keyword search. Postings with isListed=false are reachable only by direct link, so they are skipped.",
    sourceKind: "ats",
  },
  capabilities: {
    supportsKeywordQuery: false,
    supportsLocationFilter: false,
    supportsRemoteFilter: false,
    supportsDateFilter: false,
    supportsSalaryFilter: false,
    queryModel: "enumerate-target",
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

  detectTarget(url: string): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (host === "jobs.ashbyhq.com") return segments[0] ?? null;
    if (host === "api.ashbyhq.com" && segments[0] === "posting-api" && segments[1] === "job-board") return segments[2] ?? null;
    return null;
  },

  async healthCheck(ctx) {
    try {
      const res = await fetchWithRetry("https://api.ashbyhq.com/posting-api/job-board/Ashby", { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<AshbyJob>> {
    if (query.kind !== "target") throw new Error("ashby requires a target query (a job board name)");
    const token = query.target;

    const res = await fetchWithRetry(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
      {},
      ctx
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: Ashby board "${token}" search failed`);
    const data = (await res.json()) as AshbyResponse;
    yield { items: data.jobs.filter((job) => job.isListed !== false), nextCursor: null, partial: false };
  },

  normalize(job, ctx: NormalizeContext): NormalizedJobListing {
    const token = ctx.query.kind === "target" ? ctx.query.target : "unknown";
    const address = job.address?.postalAddress;
    return {
      schemaVersion: 1,
      sourceId: `ashby:${token}`,
      sourceJobId: job.id,
      idIsDerived: false,
      canonicalUrl: job.jobUrl,
      applyUrl: job.applyUrl ?? null,
      title: job.title,
      company: token,
      descriptionHtml: job.descriptionHtml ?? null,
      descriptionText: job.descriptionPlain ?? null,
      postedAt: job.publishedAt ?? null,
      fetchedAt: ctx.fetchedAt,
      // Ashby's country is free text ("USA", "European Union"), not ISO 3166 — left null.
      location: {
        raw: job.location ?? null,
        remote: job.isRemote ?? null,
        country: null,
        region: address?.addressRegion ?? null,
        city: address?.addressLocality ?? null,
      },
      compensation: compensation(job),
      employment: { type: EMPLOYMENT_TYPES[job.employmentType ?? ""] ?? null, seniorityHint: null },
      // A company's own Ashby board is definitionally never agency-posted.
      provenance: { sourceKind: "ats", posterIsLikelyAgency: false, originalSourceUrl: null },
      raw: job,
    };
  },
};
