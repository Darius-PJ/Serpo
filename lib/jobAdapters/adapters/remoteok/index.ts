// Migrated from lib/jobSources/remoteOk.ts (kept, untouched, as the legacy path).
// Third source migrated: full-dump, no server-side query — the first of the two
// "structurally distinct" cases the task's migration order calls for here.
import { fetchWithRetry } from "../../services/httpClient";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

interface RemoteOkItem {
  id?: string;
  company?: string;
  position?: string;
  tags?: string[];
  url?: string;
  date?: string;
  description?: string;
  location?: string;
}

export const remoteOkAdapter: Adapter<RemoteOkItem> = {
  metadata: {
    id: "remoteok",
    displayName: "RemoteOK",
    homepage: "https://remoteok.com",
    tosNotes:
      "Public feed, no API key. Requires a descriptive User-Agent or requests are blocked (see docs/architecture-audit.md — this did not reproduce live during Phase 1 fixture capture, see tests/fixtures/remoteok/error-not-reproduced.json). Full dump only, no server-side query; element 0 is a legal/attribution notice, not a listing.",
    sourceKind: "aggregator",
  },
  capabilities: {
    supportsKeywordQuery: false,
    supportsLocationFilter: false,
    supportsRemoteFilter: true, // remote-only by definition
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
      const res = await fetchWithRetry(
        "https://remoteok.com/api",
        { maxRetries: 0, headers: { "User-Agent": "job-tracker/1.0 (personal use, local-only)" } },
        ctx
      );
      return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  },

  async *search(_query, ctx): AsyncGenerator<AdapterPage<RemoteOkItem>> {
    const res = await fetchWithRetry("https://remoteok.com/api", { headers: { "User-Agent": "job-tracker/1.0 (personal use, local-only)" } }, ctx);
    if (!res.ok) throw new Error(`HTTP ${res.status}: RemoteOK search failed`);
    const data = (await res.json()) as RemoteOkItem[];

    // Drops the legal-notice element at index 0 (this adapter's own data-shape
    // knowledge, ported directly from the legacy connector) — no local keyword filter
    // (see arbeitnow's identical reasoning: orchestration re-filters every source
    // uniformly after merge regardless).
    const items = data.filter((item) => Boolean(item.id && item.position && item.url));
    yield { items, nextCursor: null, partial: false };
  },

  normalize(item, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: "remoteok",
      sourceJobId: item.id!,
      idIsDerived: false,
      canonicalUrl: item.url!,
      applyUrl: null,
      title: item.position!,
      company: item.company ?? null,
      descriptionHtml: null,
      descriptionText: item.description ?? null,
      postedAt: item.date ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: item.location ?? "Remote", remote: true, country: null, region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: null, seniorityHint: null },
      provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: item,
    };
  },
};
