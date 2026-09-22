// The new adapter interface (docs/adapter-interface.md, Phase 2 — now implemented).
// This tree is entirely additive: nothing in lib/jobSources/ (the legacy path) is
// changed or imported from here, and nothing here is wired into a real HTTP route yet
// (that's Phase 4, behind an ADAPTER_MODE flag). Core orchestration code in this tree
// may only import registry.ts — never a concrete adapter under adapters/** — enforced
// by tests/unit/jobAdapters/noAdapterImportsOutsideRegistry.test.ts.
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const normalizedJobListingSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),

  sourceId: z.string().min(1),
  sourceJobId: z.string().min(1),
  idIsDerived: z.boolean(),
  canonicalUrl: z.string().min(1),
  applyUrl: z.string().nullable(),

  title: z.string().min(1),
  company: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  descriptionText: z.string().nullable(),
  postedAt: z.string().nullable(),
  fetchedAt: z.string(),

  location: z.object({
    raw: z.string().nullable(),
    remote: z.boolean().nullable(),
    country: z.string().nullable(),
    region: z.string().nullable(),
    city: z.string().nullable(),
  }),

  compensation: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(["year", "hour", "month", "day", "project"]).nullable(),
    isEstimate: z.boolean(),
  }),

  employment: z.object({
    type: z.enum(["full-time", "part-time", "contract", "temporary"]).nullable(),
    seniorityHint: z.string().nullable(),
  }),

  provenance: z.object({
    sourceKind: z.enum(["direct-employer", "ats", "aggregator", "scraped-board"]),
    posterIsLikelyAgency: z.boolean().nullable(),
    originalSourceUrl: z.string().nullable(),
  }),

  raw: z.unknown(),
});

export type NormalizedJobListing = z.infer<typeof normalizedJobListingSchema>;

export type NormalizedQuery =
  | { kind: "keywords"; keywords: string; location: string | null; remoteOnly: boolean }
  | { kind: "target"; target: string };

export interface AdapterPage<TRaw> {
  items: TRaw[];
  nextCursor: string | null;
  partial: boolean;
  warning?: string;
  details?: string;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface RateLimiterHandle {
  // Resolves once it's this caller's turn (token bucket + daily quota counter).
  // Rejects with a RateLimitExceededError if the daily quota is already spent.
  acquire(): Promise<void>;
}

export interface CacheHandle {
  getStale?(criteria: object): Promise<{ listings: NormalizedJobListing[]; fetchedAt: string } | null>;
  get(criteria: object): Promise<NormalizedJobListing[] | null>;
  set(criteria: object, listings: NormalizedJobListing[]): Promise<void>;
}

export interface CircuitBreakerHandle {
  isOpen(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}

export interface AdapterContext {
  signal: AbortSignal; // first signal/deadline access starts the execution timeout
  deadline: number; // epoch ms; same execution timeout as signal
  logger: Logger;
  rateLimiter: RateLimiterHandle;
  cache: CacheHandle;
  circuitBreaker: CircuitBreakerHandle;
  correlationId: string;
}

export interface NormalizeContext {
  fetchedAt: string;
  // Added while migrating the Greenhouse adapter (Phase 4's "new source" validation
  // exercise): normalize() had no way to know which board/target produced a listing,
  // which an enumerate-target adapter (Greenhouse/Lever/a URL-crawl adapter) needs to
  // stamp a correct sourceId/company — e.g. Greenhouse's per-board sourceId is
  // "greenhouse:<token>", and only the query that drove search() knows the token.
  // Generic, not Greenhouse-specific: every adapter receives this, keyword-search
  // adapters simply don't need it. Flagged here per the task's own instruction to
  // report loudly rather than silently patch core when a new source needs an
  // interface change.
  query: NormalizedQuery;
}

export interface AdapterMetadata {
  id: string;
  displayName: string;
  homepage: string;
  tosNotes: string;
  sourceKind: NormalizedJobListing["provenance"]["sourceKind"];
}

export interface AdapterCapabilities {
  supportsKeywordQuery: boolean;
  supportsLocationFilter: boolean;
  supportsRemoteFilter: boolean;
  supportsDateFilter: boolean;
  supportsSalaryFilter: boolean;
  queryModel: "keyword-search" | "enumerate-target" | "full-dump";
  paginationStyle: "page" | "offset" | "cursor" | "none";
  requiresDetailFetch: boolean;
  runtime: "node" | "subprocess" | "sidecar-http" | "headless-browser";
  cost: { tier: "free" | "quota-limited" | "metered"; quotaUnit?: string; quotaPerInterval?: number; interval?: "second" | "minute" | "day" };
  latencyClass: "fast" | "slow" | "very-slow";
  cacheable: boolean;
  cacheTtlSeconds: number | null;
  tosForbidsStorage: boolean;
  maxConcurrency: number;
}

export interface AdapterConfigField {
  envVar: string;
  required: boolean;
  description: string;
}

export interface Adapter<TRaw = unknown> {
  metadata: AdapterMetadata;
  capabilities: AdapterCapabilities;
  configSchema: AdapterConfigField[];
  isConfigured(): boolean;
  healthCheck(ctx: AdapterContext): Promise<{ ok: boolean; detail?: string }>;
  search(query: NormalizedQuery, ctx: AdapterContext): AsyncGenerator<AdapterPage<TRaw>>;
  fetchDetail?(job: NormalizedJobListing, ctx: AdapterContext): Promise<TRaw>;
  normalize(rawItem: TRaw, ctx: NormalizeContext): NormalizedJobListing;
  // detectTarget: only present on queryModel: "enumerate-target" adapters (outlier #4/#5,
  // docs/adapter-interface.md 2d) — replaces the legacy detectIntegration.ts's closed
  // union with a per-adapter detector, so a new board platform never touches shared code.
  detectTarget?(url: string): string | null;
}

export interface SearchError {
  details?: string;
  sourceId: string;
  kind: "timeout" | "http-error" | "parse-error" | "circuit-open" | "unconfigured" | "aborted" | "unknown";
  message: string;
  retryable: boolean;
}

export interface JobSearchResultGroup {
  warning?: string;
  details?: string;
  source: string;
  label: string;
  listings: NormalizedJobListing[];
}

export interface SearchEnvelope {
  results: JobSearchResultGroup[];
  errors: SearchError[];
  meta: {
    perSourceTiming: Record<string, { startedAt: string; durationMs: number }>;
    degraded: boolean;
  };
}
