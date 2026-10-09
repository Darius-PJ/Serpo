import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { z } from "zod";
import { mswServer, startMswServer, stopMswServer } from "@/tests/setup/mswServer";
import { loadFixture } from "@/tests/fixtures/loadFixture";
import { ashbyAdapter } from "@/lib/jobAdapters/adapters/ashby";
import { runAdapterContractSuite } from "@/lib/jobAdapters/testing/contractSuite";
import type { AdapterContext, NormalizedQuery } from "@/lib/jobAdapters/types";

// Real captured responses (tests/fixtures/ashby): two Linear jobs and one Ramp job with a salary.
const typical = loadFixture("ashby", "typical");
const empty = loadFixture("ashby", "empty");
const error = loadFixture("ashby", "error");
const typicalJobs = z.object({ jobs: z.array(z.object({ id: z.string() }).passthrough()).min(2) }).parse(typical.body).jobs;

const ashbyHandler = http.get("https://api.ashbyhq.com/posting-api/job-board/:board", async ({ params }) => {
  switch (params.board) {
    case "EMPTY_TEST":
      return HttpResponse.json(empty.body, { status: empty.status });
    case "ERROR_TEST":
      return HttpResponse.json(error.body, { status: error.status });
    case "HANG_TEST":
      await delay("infinite");
      return HttpResponse.json(empty.body);
    case "UNLISTED_TEST":
      return HttpResponse.json({ apiVersion: "1", jobs: [{ ...typicalJobs[0], isListed: false }, typicalJobs[1]] });
  }
  return HttpResponse.json(typical.body, { status: typical.status });
});

beforeAll(() => {
  startMswServer();
  mswServer.use(ashbyHandler);
});

afterAll(() => {
  stopMswServer();
});

runAdapterContractSuite(ashbyAdapter);

function testContext(): AdapterContext {
  return {
    signal: new AbortController().signal,
    deadline: Date.now() + 30_000,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    rateLimiter: { async acquire() {} },
    cache: { async get() { return null; }, async set() {} },
    circuitBreaker: { isOpen: () => false, recordSuccess() {}, recordFailure() {} },
    correlationId: "ashby-test",
  };
}

async function run(board: string) {
  const query: NormalizedQuery = { kind: "target", target: board };
  const items = [];
  for await (const page of ashbyAdapter.search(query, testContext())) items.push(...page.items);
  return items.map((item) => ashbyAdapter.normalize(item, { fetchedAt: "2026-01-01T00:00:00.000Z", query }));
}

describe("ashby adapter", () => {
  it("recognizes hosted job-board and API URLs, and nothing else", () => {
    expect(ashbyAdapter.detectTarget!("https://jobs.ashbyhq.com/linear")).toBe("linear");
    expect(ashbyAdapter.detectTarget!("https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff")).toBe("linear");
    expect(ashbyAdapter.detectTarget!("https://api.ashbyhq.com/posting-api/job-board/ramp")).toBe("ramp");
    expect(ashbyAdapter.detectTarget!("https://api.ashbyhq.com/other/ramp")).toBeNull();
    expect(ashbyAdapter.detectTarget!("https://boards.greenhouse.io/linear")).toBeNull();
  });

  it("skips postings Ashby marks as direct-link only", async () => {
    const listings = await run("UNLISTED_TEST");
    expect(listings.map((listing) => listing.sourceJobId)).toEqual([typicalJobs[1].id]);
  });

  it("maps a real salary component, location and employment type", async () => {
    const listings = await run("linear");
    const withSalary = listings.find((listing) => listing.compensation.min !== null);
    expect(withSalary?.compensation).toMatchObject({ currency: "USD", period: "year", isEstimate: false });
    expect(withSalary!.compensation.max!).toBeGreaterThanOrEqual(withSalary!.compensation.min!);
    expect(listings[0]).toMatchObject({
      sourceId: "ashby:linear",
      company: "linear",
      employment: { type: "full-time" },
      location: { raw: "Europe", remote: true, country: null },
    });
  });

  it("rejects an unknown board with the HTTP-status prefix runSearch classifies on", async () => {
    await expect(run("ERROR_TEST")).rejects.toThrow("HTTP 404: Ashby board");
  });
});
