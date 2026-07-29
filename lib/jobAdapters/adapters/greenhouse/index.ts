// New-source validation exercise (Phase 4's final step) — ported from
// lib/jobSources/greenhouseBoard.ts (kept, untouched, as the legacy path), which is
// per-account dynamic (lib/jobSources/searchPoolBoards.ts), not part of the static
// CONNECTORS array. detectTarget() replaces lib/jobSources/detectIntegration.ts's
// shared closed-union detector for this platform specifically — adding a third ATS
// (e.g. Ashby) means adding its own adapters/ashby/ with its own detectTarget, never
// touching this file or any shared one.
//
// One real interface gap surfaced by this exercise, reported rather than silently
// patched: NormalizeContext had no way to carry which board/target produced a
// listing — fixed generically in lib/jobAdapters/types.ts (added `query`), not with
// anything Greenhouse-specific. See that file's comment and the commit message.
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export const greenhouseAdapter: Adapter<GreenhouseJob> = {
  metadata: {
    id: "greenhouse",
    displayName: "Greenhouse",
    homepage: "https://developers.greenhouse.io/job-board.html",
    tosNotes: "Public, unauthenticated, per-company board API. No native keyword search — filtering happens locally, same as other full-dump/enumerate-target adapters.",
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
    if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") return segments[0] ?? null;
    if (host === "boards-api.greenhouse.io") return segments[2] ?? null; // /v1/boards/{token}/jobs
    return null;
  },

  async healthCheck(ctx) {
    try {
      const res = await fetchWithRetry("https://boards-api.greenhouse.io/v1/boards/stripe/jobs", { maxRetries: 0 }, ctx);
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<GreenhouseJob>> {
    if (query.kind !== "target") throw new Error("greenhouse requires a target query (a board token)");
    const token = query.target;

    const res = await fetchWithRetry(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`, {}, ctx);
    if (!res.ok) throw new Error(`Greenhouse board "${token}" search failed: HTTP ${res.status}`);
    const data = (await res.json()) as GreenhouseResponse;
    yield { items: data.jobs, nextCursor: null, partial: false };
  },

  normalize(job, ctx: NormalizeContext): NormalizedJobListing {
    const token = ctx.query.kind === "target" ? ctx.query.target : "unknown";
    return {
      schemaVersion: 1,
      sourceId: `greenhouse:${token}`,
      sourceJobId: String(job.id),
      idIsDerived: false,
      canonicalUrl: job.absolute_url,
      applyUrl: null,
      title: job.title,
      company: token,
      descriptionHtml: job.content ?? null,
      descriptionText: null,
      postedAt: job.updated_at ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: job.location?.name ?? null, remote: null, country: null, region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: null, seniorityHint: null },
      // A company's own Greenhouse board is definitionally never agency-posted.
      provenance: { sourceKind: "ats", posterIsLikelyAgency: false, originalSourceUrl: null },
      raw: job,
    };
  },
};
