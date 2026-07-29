// A single parameterized test suite every adapter is run against automatically
// (Phase 3 requirement). Phase 4 will call this from each real adapter's own test
// file with real fixture-derived queries; today it's proven against the reference
// adapters in fixtureAdapters.ts. Asserts only from what the adapter/fixtures give
// it — no network, no live calls.
import { describe, expect, it } from "vitest";
import type { Adapter, AdapterContext, NormalizedQuery } from "../types";
import { normalizedJobListingSchema } from "../types";

export interface ContractFixtures {
  happyQuery: NormalizedQuery;
  emptyQuery: NormalizedQuery;
  erroringQuery: NormalizedQuery;
  hangingQuery: NormalizedQuery;
}

function tokenQuery(adapter: Adapter, token: string): NormalizedQuery {
  return adapter.capabilities.queryModel === "enumerate-target"
    ? { kind: "target", target: token }
    : { kind: "keywords", keywords: token, location: null, remoteOnly: false };
}

function defaultFixtures(adapter: Adapter): ContractFixtures {
  return {
    happyQuery: tokenQuery(adapter, "HAPPY_TEST"),
    emptyQuery: tokenQuery(adapter, "EMPTY_TEST"),
    erroringQuery: tokenQuery(adapter, "ERROR_TEST"),
    hangingQuery: tokenQuery(adapter, "HANG_TEST"),
  };
}

// A minimal stand-in AdapterContext — search()/normalize() never legitimately need a
// real DB-backed cache/rate-limiter to be exercised in isolation like this; only the
// orchestration layer (runSearch.ts) does, and that's tested separately.
function createTestContext(signal: AbortSignal = new AbortController().signal): AdapterContext {
  return {
    signal,
    deadline: Date.now() + 30_000,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    rateLimiter: { async acquire() {} },
    cache: { async get() { return null; }, async set() {} },
    circuitBreaker: { isOpen: () => false, recordSuccess() {}, recordFailure() {} },
    correlationId: "test-correlation-id",
  };
}

async function collectPages<TRaw>(adapter: Adapter<TRaw>, query: NormalizedQuery, ctx: AdapterContext) {
  const pages = [];
  for await (const page of adapter.search(query, ctx)) {
    pages.push(page);
  }
  return pages;
}

// Standalone (also used directly by a negative test against a deliberately
// non-compliant adapter, to prove this check has teeth) — rejects/throws if the
// adapter doesn't terminate promptly once its context's signal aborts.
export async function assertHonorsAbortSignal(adapter: Adapter, hangingQuery: NormalizedQuery, boundMs = 300): Promise<void> {
  const controller = new AbortController();
  const ctx = createTestContext(controller.signal);
  const generator = adapter.search(hangingQuery, ctx);

  const iterationPromise = generator.next();
  setTimeout(() => controller.abort(new DOMException("test abort", "AbortError")), 10);

  const timeoutSentinel = Symbol("timeout");
  const raced = await Promise.race([
    iterationPromise.then(() => "settled" as const).catch(() => "settled" as const),
    new Promise((resolve) => setTimeout(() => resolve(timeoutSentinel), boundMs)),
  ]);

  if (raced === timeoutSentinel) {
    throw new Error(`${adapter.metadata.id}: search() did not terminate within ${boundMs}ms of ctx.signal aborting`);
  }
}

export function runAdapterContractSuite<TRaw>(adapter: Adapter<TRaw>, fixtureOverrides: Partial<ContractFixtures> = {}): void {
  const fixtures = { ...defaultFixtures(adapter), ...fixtureOverrides };

  describe(`adapter contract: ${adapter.metadata.id}`, () => {
    it("declares internally consistent capabilities (paginationStyle: none implies exactly one page)", async () => {
      if (adapter.capabilities.paginationStyle !== "none") return;
      const pages = await collectPages(adapter, fixtures.happyQuery, createTestContext());
      expect(pages).toHaveLength(1);
    });

    it("normalize() output validates against the schema for every item the happy-path search yields", async () => {
      const pages = await collectPages(adapter, fixtures.happyQuery, createTestContext());
      const fetchedAt = new Date().toISOString();
      for (const page of pages) {
        for (const rawItem of page.items) {
          const normalized = adapter.normalize(rawItem, { fetchedAt, query: fixtures.happyQuery });
          expect(() => normalizedJobListingSchema.parse(normalized)).not.toThrow();
        }
      }
    });

    it("normalize() is pure and deterministic (same input -> same output, no network)", async () => {
      const pages = await collectPages(adapter, fixtures.happyQuery, createTestContext());
      const rawItem = pages[0]?.items[0];
      if (rawItem === undefined) return;
      const ctx = { fetchedAt: "2026-01-01T00:00:00.000Z", query: fixtures.happyQuery };
      expect(adapter.normalize(rawItem, ctx)).toEqual(adapter.normalize(rawItem, ctx));
    });

    it("empty results yield an empty page, not a throw", async () => {
      const pages = await collectPages(adapter, fixtures.emptyQuery, createTestContext());
      const totalItems = pages.reduce((sum, page) => sum + page.items.length, 0);
      expect(totalItems).toBe(0);
    });

    it("error fixtures produce a typed rejection, not an unhandled exception mid-iteration", async () => {
      await expect(collectPages(adapter, fixtures.erroringQuery, createTestContext())).rejects.toBeInstanceOf(Error);
    });

    it("terminates promptly and cleanly once ctx.signal aborts mid-flight", async () => {
      await assertHonorsAbortSignal(adapter, fixtures.hangingQuery);
    });

    it("does not write to global state", async () => {
      const before = new Set(Object.keys(globalThis));
      const pages = await collectPages(adapter, fixtures.happyQuery, createTestContext());
      const rawItem = pages[0]?.items[0];
      if (rawItem !== undefined) adapter.normalize(rawItem, { fetchedAt: new Date().toISOString(), query: fixtures.happyQuery });
      const after = new Set(Object.keys(globalThis));
      expect([...after].filter((key) => !before.has(key))).toEqual([]);
    });

    it("required config absence yields unconfigured, not a crash", () => {
      if (adapter.configSchema.length === 0) return;
      const originalValues = adapter.configSchema.map((field) => process.env[field.envVar]);
      for (const field of adapter.configSchema) delete process.env[field.envVar];
      try {
        expect(() => adapter.isConfigured()).not.toThrow();
        expect(adapter.isConfigured()).toBe(false);
      } finally {
        adapter.configSchema.forEach((field, i) => {
          if (originalValues[i] !== undefined) process.env[field.envVar] = originalValues[i]!;
        });
      }
    });
  });
}
