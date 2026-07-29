// Minimal reference adapters used ONLY to prove the Phase 3 harness (registry, shared
// services, contract suite) works correctly. These are NOT real production sources —
// real per-source adapters (Adzuna, RemoteOK, JobSpy, ...) are Phase 4 work, and each
// one will need real recorded fixtures under test/fixtures/<source>/ (Phase 1, still
// outstanding — see docs/architecture-audit.md). Nothing here is registered in
// registry.ts; these live under testing/ specifically so they're never mistaken for
// real sources.
import type { Adapter, AdapterPage, NormalizedQuery, NormalizeContext } from "../types";

export interface FixtureRawItem {
  id: string;
  title: string;
  company: string;
}

const SAMPLE_ITEMS: FixtureRawItem[] = [
  { id: "1", title: "Backend Engineer", company: "Acme" },
  { id: "2", title: "Frontend Engineer", company: "Widgets Co" },
];

export function normalizeFixtureItem(sourceId: string, item: FixtureRawItem, ctx: NormalizeContext) {
  return {
    schemaVersion: 1 as const,
    sourceId,
    sourceJobId: item.id,
    idIsDerived: false,
    canonicalUrl: `https://example.com/${sourceId}/${item.id}`,
    applyUrl: null,
    title: item.title,
    company: item.company,
    descriptionHtml: null,
    descriptionText: null,
    postedAt: null,
    fetchedAt: ctx.fetchedAt,
    location: { raw: null, remote: null, country: null, region: null, city: null },
    compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
    employment: { type: null, seniorityHint: null },
    provenance: { sourceKind: "direct-employer" as const, posterIsLikelyAgency: null, originalSourceUrl: null },
    raw: item,
  };
}

// Every fixture adapter below reads its "test scenario" off the query — .keywords for
// keyword-search/full-dump adapters, .target for enumerate-target ones — so the same
// three magic strings (EMPTY_TEST/ERROR_TEST/HANG_TEST) drive the generic contract
// suite uniformly across every queryModel.
function queryToken(query: NormalizedQuery): string | null {
  if (query.kind === "keywords") return query.keywords;
  if (query.kind === "target") return query.target;
  return null;
}

// A generator body shared by every "well-behaved" fixture adapter below — reacts to
// the three test tokens, and (critically) actually honors ctx.signal for HANG_TEST,
// since that's the behavior the contract suite's abort-signal check requires.
async function* wellBehavedSearch(
  sourceId: string,
  query: NormalizedQuery,
  signal: AbortSignal
): AsyncGenerator<AdapterPage<FixtureRawItem>> {
  const token = queryToken(query);
  if (token === "EMPTY_TEST") {
    yield { items: [], nextCursor: null, partial: false };
    return;
  }
  if (token === "ERROR_TEST") {
    throw new Error("HTTP 500: simulated upstream failure");
  }
  if (token === "HANG_TEST") {
    await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    return;
  }
  const junkFirstItem: FixtureRawItem = { id: "", title: "", company: "" }; // mirrors RemoteOK's element-zero legal notice
  yield { items: [junkFirstItem, ...SAMPLE_ITEMS].filter((item) => item.id), nextCursor: null, partial: false };
  void sourceId;
}

export const keywordAdapter: Adapter<FixtureRawItem> = {
  metadata: { id: "fixture-keyword", displayName: "Fixture Keyword Source", homepage: "https://example.com", tosNotes: "test fixture", sourceKind: "direct-employer" },
  capabilities: {
    supportsKeywordQuery: true,
    supportsLocationFilter: false,
    supportsRemoteFilter: false,
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
  configSchema: [],
  isConfigured: () => true,
  async healthCheck() {
    return { ok: true };
  },
  search(query, ctx) {
    return wellBehavedSearch("fixture-keyword", query, ctx.signal);
  },
  normalize(rawItem, ctx) {
    return normalizeFixtureItem("fixture-keyword", rawItem, ctx);
  },
};

// full-dump, paginationStyle: none — mirrors RemoteOK's shape (one big array, a junk
// item at index zero that must never reach normalize()).
export const fullDumpAdapter: Adapter<FixtureRawItem> = {
  ...keywordAdapter,
  metadata: { ...keywordAdapter.metadata, id: "fixture-full-dump" },
  capabilities: { ...keywordAdapter.capabilities, supportsKeywordQuery: false, queryModel: "full-dump" },
  search(query, ctx) {
    return wellBehavedSearch("fixture-full-dump", query, ctx.signal);
  },
  normalize(rawItem, ctx) {
    return normalizeFixtureItem("fixture-full-dump", rawItem, ctx);
  },
};

// enumerate-target — mirrors Greenhouse/Lever/a JSON-LD crawler (docs/adapter-interface.md
// 2d, outliers #4/#5). detectTarget lives on the adapter itself, never in a shared file.
export const enumerateTargetAdapter: Adapter<FixtureRawItem> = {
  ...keywordAdapter,
  metadata: { ...keywordAdapter.metadata, id: "fixture-enumerate-target", sourceKind: "ats" },
  capabilities: { ...keywordAdapter.capabilities, supportsKeywordQuery: false, queryModel: "enumerate-target" },
  detectTarget(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "boards.example.com") return null;
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    } catch {
      return null;
    }
  },
  search(query, ctx) {
    if (query.kind !== "target") throw new Error("fixture-enumerate-target requires a target query");
    return wellBehavedSearch("fixture-enumerate-target", query, ctx.signal);
  },
  normalize(rawItem, ctx) {
    return normalizeFixtureItem("fixture-enumerate-target", rawItem, ctx);
  },
};

// Always unconfigured — proves "required config absence yields unconfigured, not a crash."
export const unconfiguredAdapter: Adapter<FixtureRawItem> = {
  ...keywordAdapter,
  metadata: { ...keywordAdapter.metadata, id: "fixture-unconfigured" },
  configSchema: [{ envVar: "FIXTURE_UNCONFIGURED_API_KEY", required: true, description: "never set in any environment" }],
  isConfigured: () => Boolean(process.env.FIXTURE_UNCONFIGURED_API_KEY),
};

// Deliberately misbehaves by ignoring ctx.signal entirely — used only in
// contractSuite.test.ts to prove the abort-signal check actually has teeth (i.e. it's
// possible for a real adapter to fail it, so a green run means something).
export const signalIgnoringAdapter: Adapter<FixtureRawItem> = {
  ...keywordAdapter,
  metadata: { ...keywordAdapter.metadata, id: "fixture-signal-ignoring" },
  async *search(query): AsyncGenerator<AdapterPage<FixtureRawItem>> {
    const token = queryToken(query);
    if (token === "HANG_TEST") {
      await new Promise<void>(() => {}); // never resolves, never listens for abort
      return;
    }
    yield { items: SAMPLE_ITEMS, nextCursor: null, partial: false };
  },
  normalize(rawItem, ctx) {
    return normalizeFixtureItem("fixture-signal-ignoring", rawItem, ctx);
  },
};

export const ALL_FIXTURE_ADAPTERS = [keywordAdapter, fullDumpAdapter, enumerateTargetAdapter, unconfiguredAdapter];
