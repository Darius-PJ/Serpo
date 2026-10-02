// Careerjet publisher API v4 (https://www.careerjet.com/partners/api), added for
// contract sourcing: its documented contract_type filter separates contract from
// temporary work. Built from the docs alone — no key existed when it was written
// (tests/fixtures/careerjet/UNCONFIGURED.json).
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface CareerjetJob {
  title: string;
  company?: string;
  date?: string;
  description?: string;
  locations?: string;
  salary?: string;
  salary_currency_code?: string;
  salary_max?: number;
  salary_min?: number;
  salary_type?: "Y" | "M" | "W" | "D" | "H";
  url: string;
}

type CareerjetResponse =
  | { type: "JOBS"; hits: number; message: string; pages: number; jobs: CareerjetJob[] }
  | { type: "LOCATIONS"; locations: string[]; message: string };

// Careerjet's contract_type codes for the two kinds of work Serpo's "contract" filter means.
type ContractFilter = "c" | "t";

// The filter that produced a job is carried beside it, not merged into it, so `raw`
// stays exactly what Careerjet sent while normalize() can still report the type
// Careerjet itself asserted by matching the job to that filter.
interface CareerjetItem {
  job: CareerjetJob;
  contractFilter: ContractFilter | null;
}

const ENDPOINT = "https://search.api.careerjet.net/v4/query";

// Both are required on every request (403 without them) and are meant to describe the
// end user who triggered the search. Serpo only listens on loopback and its one user
// searches from this machine, so the loopback address is the honest user_ip and a fixed
// Serpo string the honest user_agent. Whether Careerjet accepts these values is
// unverified until a key is configured.
const USER_IP = "127.0.0.1";
const USER_AGENT = "Serpo (local-first job-search CRM)";

const EMPLOYMENT_TYPE: Record<ContractFilter, "contract" | "temporary"> = { c: "contract", t: "temporary" };

// No weekly period exists in the schema, so a weekly figure is left without a period.
const SALARY_PERIOD: Record<NonNullable<CareerjetJob["salary_type"]>, NormalizedJobListing["compensation"]["period"]> = {
  Y: "year",
  M: "month",
  W: null,
  D: "day",
  H: "hour",
};

// Every request needs these: without user_ip/user_agent Careerjet answers 403, and
// without locale_code it silently searches its en_GB index instead of the US one.
function requestUrl(params: Record<string, string>): string {
  return `${ENDPOINT}?${new URLSearchParams({ locale_code: "en_US", user_ip: USER_IP, user_agent: USER_AGENT, ...params })}`;
}

// The docs don't say how a job without a salary is represented; a zero or missing
// figure is treated as "no figure" rather than reported as a real salary of 0.
function salaryFigure(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export const careerjetAdapter: Adapter<CareerjetItem> = {
  metadata: {
    id: "careerjet",
    displayName: "Careerjet",
    homepage: "https://www.careerjet.com/partners/api",
    tosNotes:
      "Requires a Careerjet publisher account, a website registered to it (each website gets its own API key), and an allowlist of up to 8 caller IP addresses. Every request must carry the end user's IP and user agent. Job links are Careerjet tracking URLs (jobviewtrack.com), not employer postings.",
    sourceKind: "aggregator",
  },
  capabilities: {
    supportsKeywordQuery: true,
    supportsLocationFilter: true,
    supportsRemoteFilter: false,
    supportsDateFilter: false,
    supportsSalaryFilter: false,
    // The docs describe a server-side keyword search, but docs/adding-a-source.md asks
    // for a live nonsense-keyword check before trusting that, and none was possible
    // without a key. Unverified live.
    queryModel: "keyword-search",
    // The API is page-numbered (page 1–10); this adapter walks page 1 only today.
    paginationStyle: "page",
    requiresDetailFetch: false,
    runtime: "node",
    cost: { tier: "free" },
    latencyClass: "fast",
    cacheable: true,
    cacheTtlSeconds: 900,
    tosForbidsStorage: false,
    maxConcurrency: 3,
  },
  configSchema: [{ envVar: "CAREERJET_API_KEY", required: true, description: "Careerjet publisher API key" }],
  isConfigured: () => Boolean(process.env.CAREERJET_API_KEY),

  async healthCheck(ctx) {
    try {
      const res = await fetchWithRetry(
        requestUrl({ keywords: "engineer", page: "1", page_size: "1" }),
        { maxRetries: 0, headers: { Authorization: `Basic ${btoa(`${process.env.CAREERJET_API_KEY}:`)}` } },
        ctx
      );
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<CareerjetItem>> {
    if (query.kind !== "keywords") throw new Error("careerjet requires a keyword query");

    // Careerjet takes one contract_type per request, and "contract" means contract or
    // temporary work, so contract mode costs two requests.
    const filters: (ContractFilter | null)[] = query.employmentType === "contract" ? ["c", "t"] : [null];

    for (const contractFilter of filters) {
      const params: Record<string, string> = { keywords: query.keywords, page: "1", page_size: "20" };
      if (query.location) params.location = query.location;
      if (contractFilter) params.contract_type = contractFilter;

      const res = await fetchWithRetry(requestUrl(params), { headers: { Authorization: `Basic ${btoa(`${process.env.CAREERJET_API_KEY}:`)}` } }, ctx);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Careerjet search failed`);
      const data = (await res.json()) as CareerjetResponse;

      if (data.type === "LOCATIONS") {
        // Careerjet performs no search at all when the location doesn't resolve, and the
        // location is the same for every filter, so there is nothing left to ask.
        const candidates = data.locations.length > 0 ? ` Candidates: ${data.locations.join("; ")}.` : "";
        yield {
          items: [],
          nextCursor: null,
          partial: false,
          warning: `Careerjet could not resolve the location "${query.location ?? ""}" (${data.message}).${candidates}`,
        };
        return;
      }

      yield { items: data.jobs.map((job) => ({ job, contractFilter })), nextCursor: null, partial: false };
    }
  },

  normalize({ job, contractFilter }, ctx: NormalizeContext): NormalizedJobListing {
    const postedMs = job.date ? Date.parse(job.date) : NaN;
    const min = salaryFigure(job.salary_min);
    const max = salaryFigure(job.salary_max);
    const hasSalary = min !== null || max !== null;
    return {
      schemaVersion: 1,
      sourceId: "careerjet",
      // Jobs carry no id; the tracking URL is the only per-job identifier.
      sourceJobId: job.url,
      idIsDerived: true,
      canonicalUrl: job.url,
      applyUrl: null,
      title: job.title,
      company: job.company || null,
      descriptionHtml: null,
      descriptionText: job.description || null,
      postedAt: Number.isNaN(postedMs) ? null : new Date(postedMs).toISOString(),
      fetchedAt: ctx.fetchedAt,
      // locale_code=en_US searches Careerjet's US index.
      location: { raw: job.locations || null, remote: null, country: "US", region: null, city: null },
      compensation: {
        min,
        max,
        currency: hasSalary ? (job.salary_currency_code || null) : null,
        period: hasSalary && job.salary_type ? (SALARY_PERIOD[job.salary_type] ?? null) : null,
        isEstimate: false,
      },
      // Careerjet returns no per-job type; a job returned for a contract_type filter is
      // Careerjet's own assertion of that type.
      employment: { type: contractFilter ? EMPLOYMENT_TYPE[contractFilter] : null, seniorityHint: null },
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: job,
    };
  },
};
