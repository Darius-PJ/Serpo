// Migrated alongside Greenhouse (same enumerate-target shape) — ported from
// lib/jobSources/leverBoard.ts (kept, untouched, as the legacy path). Also part of
// "the remainder" of the static-connector-adjacent sources, migrated using the same
// bridge machinery Greenhouse's validation exercise proved out.
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface LeverPosting {
  id: string;
  text: string;
  categories?: { location?: string; team?: string };
  hostedUrl: string;
  workplaceType?: "unspecified" | "on-site" | "remote" | "hybrid";
  descriptionPlain?: string;
  createdAt?: number; // unix ms
}

export const leverAdapter: Adapter<LeverPosting> = {
  metadata: {
    id: "lever",
    displayName: "Lever",
    homepage: "https://github.com/lever/postings-api",
    tosNotes: "Public, unauthenticated, per-company board API. No native keyword search.",
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
    if (host === "jobs.lever.co") return segments[0] ?? null;
    if (host === "api.lever.co") return segments[2] ?? null; // /v0/postings/{token}
    return null;
  },

  async healthCheck(ctx) {
    try {
      // No confirmed-live real token as of Phase 1 (tests/fixtures/lever/typical-not-found.json)
      // — a 404 for a nonexistent token is still a genuine, working response from a
      // reachable API, which is what this check actually verifies.
      const res = await fetchWithRetry("https://api.lever.co/v0/postings/this-is-only-a-reachability-check?mode=json", { maxRetries: 0 }, ctx);
      return res.status === 404 || res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<LeverPosting>> {
    if (query.kind !== "target") throw new Error("lever requires a target query (a board token)");
    const token = query.target;

    const res = await fetchWithRetry(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`, {}, ctx);
    if (!res.ok) throw new Error(`Lever board "${token}" search failed: HTTP ${res.status}`);
    const data = (await res.json()) as LeverPosting[];
    yield { items: data, nextCursor: null, partial: false };
  },

  normalize(posting, ctx: NormalizeContext): NormalizedJobListing {
    const token = ctx.query.kind === "target" ? ctx.query.target : "unknown";
    return {
      schemaVersion: 1,
      sourceId: `lever:${token}`,
      sourceJobId: posting.id,
      idIsDerived: false,
      canonicalUrl: posting.hostedUrl,
      applyUrl: null,
      title: posting.text,
      company: token,
      descriptionHtml: null,
      descriptionText: posting.descriptionPlain ?? null,
      postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : null,
      fetchedAt: ctx.fetchedAt,
      location: {
        raw: posting.categories?.location ?? null,
        remote: posting.workplaceType === "remote",
        country: null,
        region: null,
        city: null,
      },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: null, seniorityHint: null },
      // A company's own Lever board is definitionally never agency-posted.
      provenance: { sourceKind: "ats", posterIsLikelyAgency: false, originalSourceUrl: null },
      raw: posting,
    };
  },
};
