import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { z } from "zod";
import { mswServer, startMswServer, stopMswServer } from "@/tests/setup/mswServer";
import { loadFixture } from "@/tests/fixtures/loadFixture";
import { smartRecruitersAdapter } from "@/lib/jobAdapters/adapters/smartrecruiters";
import { runAdapterContractSuite } from "@/lib/jobAdapters/testing/contractSuite";
import type { AdapterContext, NormalizedQuery } from "@/lib/jobAdapters/types";

// Real captured responses (tests/fixtures/smartrecruiters): three Equinox postings, an
// unknown company's 200-with-nothing answer, and a real validation error.
const typical = loadFixture("smartrecruiters", "typical");
const empty = loadFixture("smartrecruiters", "empty");
const error = loadFixture("smartrecruiters", "error");
const posting = z.object({ content: z.array(z.object({ id: z.string() }).passthrough()).min(1) }).parse(typical.body).content[0];

// A company with `total` postings, served in the real 100-per-page shape.
function pagedBody(total: number, offset: number, limit: number) {
  const count = Math.max(0, Math.min(limit, total - offset));
  const content = Array.from({ length: count }, (_, i) => ({ ...posting, id: `posting-${offset + i}` }));
  return { offset, limit, totalFound: total, content };
}

const offsetsRequested: number[] = [];

const smartRecruitersHandler = http.get("https://api.smartrecruiters.com/v1/companies/:company/postings", async ({ params, request }) => {
  const search = new URL(request.url).searchParams;
  const offset = Number(search.get("offset"));
  const limit = Number(search.get("limit"));
  offsetsRequested.push(offset);
  switch (params.company) {
    case "EMPTY_TEST":
      return HttpResponse.json(empty.body, { status: empty.status });
    case "ERROR_TEST":
      return HttpResponse.json(error.body, { status: error.status });
    case "HANG_TEST":
      await delay("infinite");
      return HttpResponse.json(empty.body);
    case "PAGED_TEST":
      return HttpResponse.json(pagedBody(250, offset, limit));
    case "HUGE_TEST":
      return HttpResponse.json(pagedBody(25_000, offset, limit));
  }
  return HttpResponse.json(typical.body, { status: typical.status });
});

beforeAll(() => {
  startMswServer();
  mswServer.use(smartRecruitersHandler);
});

afterAll(() => {
  stopMswServer();
});

runAdapterContractSuite(smartRecruitersAdapter);

function testContext(): AdapterContext {
  return {
    signal: new AbortController().signal,
    deadline: Date.now() + 30_000,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    rateLimiter: { async acquire() {} },
    cache: { async get() { return null; }, async set() {} },
    circuitBreaker: { isOpen: () => false, recordSuccess() {}, recordFailure() {} },
    correlationId: "smartrecruiters-test",
  };
}

async function run(company: string) {
  offsetsRequested.length = 0;
  const query: NormalizedQuery = { kind: "target", target: company };
  const items = [];
  for await (const page of smartRecruitersAdapter.search(query, testContext())) items.push(...page.items);
  return items.map((item) => smartRecruitersAdapter.normalize(item, { fetchedAt: "2026-01-01T00:00:00.000Z", query }));
}

describe("smartrecruiters adapter", () => {
  it("recognizes careers, job and API URLs, and nothing else", () => {
    expect(smartRecruitersAdapter.detectTarget!("https://careers.smartrecruiters.com/Equinox")).toBe("Equinox");
    expect(smartRecruitersAdapter.detectTarget!("https://jobs.smartrecruiters.com/Equinox/744000154537089")).toBe("Equinox");
    expect(smartRecruitersAdapter.detectTarget!("https://api.smartrecruiters.com/v1/companies/Sodexo/postings")).toBe("Sodexo");
    expect(smartRecruitersAdapter.detectTarget!("https://www.smartrecruiters.com/Equinox")).toBeNull();
  });

  it("follows offsets until every posting is read", async () => {
    const listings = await run("PAGED_TEST");
    expect(offsetsRequested).toEqual([0, 100, 200]);
    expect(listings).toHaveLength(250);
  });

  it("stops after the newest 1,000 postings of a very large employer", async () => {
    const listings = await run("HUGE_TEST");
    expect(offsetsRequested).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(listings).toHaveLength(1000);
  });

  it("normalizes a real posting: public job URL, company name, ISO country, employment type", async () => {
    const [housekeeping, frontDesk, maintenance] = await run("Equinox");
    expect(housekeeping).toMatchObject({
      sourceId: "smartrecruiters:Equinox",
      canonicalUrl: "https://jobs.smartrecruiters.com/Equinox/744000154537089",
      company: "Equinox",
      location: { raw: "Nashville, TN, United States", remote: false, country: "US", region: "TN", city: "Nashville" },
      employment: { type: "part-time", seniorityHint: null },
    });
    expect(frontDesk.employment.seniorityHint).toBe("Associate");
    expect(maintenance.employment.type).toBe("full-time");
  });

  it("rejects non-2xx responses with the HTTP-status prefix runSearch classifies on", async () => {
    await expect(run("ERROR_TEST")).rejects.toThrow("HTTP 400: SmartRecruiters company");
  });
});
