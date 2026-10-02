import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer } from "@/tests/setup/mswServer";
import { careerjetAdapter } from "@/lib/jobAdapters/adapters/careerjet";
import { runAdapterContractSuite } from "@/lib/jobAdapters/testing/contractSuite";
import type { AdapterContext, NormalizedQuery } from "@/lib/jobAdapters/types";

// No Careerjet key exists yet (tests/fixtures/careerjet/UNCONFIGURED.json), so every
// body below is DOC-DERIVED from https://www.careerjet.com/partners/api — shaped after
// its documented v4 examples, not captured from a live response.
function docJob(title: string, overrides: Record<string, unknown> = {}) {
  return {
    title,
    company: "Acme Networks",
    date: "Wed,15 Nov 2025 19:13:43 GMT",
    description: "Job description excerpt",
    locations: "Atlanta, GA",
    salary: "$30 - 45 per hour",
    salary_currency_code: "USD",
    salary_max: 45.0,
    salary_min: 30.0,
    salary_type: "H",
    url: `https://jobviewtrack.com/v2/${encodeURIComponent(title)}`,
    ...overrides,
  };
}

function docJobs(jobs: object[]) {
  return { type: "JOBS", hits: jobs.length, message: `${jobs.length} matching jobs found`, pages: 1, response_time: 0.322, jobs };
}

const requests: Request[] = [];

const careerjetHandler = http.get("https://search.api.careerjet.net/v4/query", async ({ request }) => {
  requests.push(request.clone());
  const params = new URL(request.url).searchParams;
  switch (params.get("keywords")) {
    case "EMPTY_TEST":
      return HttpResponse.json(docJobs([]));
    case "ERROR_TEST":
      return HttpResponse.json({ message: "Missing param user_ip or user_agent" }, { status: 403 });
    case "HANG_TEST":
      await delay("infinite");
      return HttpResponse.json(docJobs([]));
    case "LOCATION_TEST":
      return HttpResponse.json({
        type: "LOCATIONS",
        locations: ["Atlanta, GA", "Atlanta, TX"],
        message: "multiple locations found",
        response_time: 0.11,
      });
  }
  const contractType = params.get("contract_type");
  if (contractType === "c") return HttpResponse.json(docJobs([docJob("Network Engineer")]));
  if (contractType === "t") return HttpResponse.json(docJobs([docJob("NOC Technician")]));
  return HttpResponse.json(docJobs([docJob("Network Engineer"), docJob("Systems Administrator", { salary_type: "W" })]));
});

beforeAll(() => {
  vi.stubEnv("CAREERJET_API_KEY", "test-key");
  startMswServer();
  mswServer.use(careerjetHandler);
});

afterAll(() => {
  stopMswServer();
  vi.unstubAllEnvs();
});

runAdapterContractSuite(careerjetAdapter);

function testContext(): AdapterContext {
  return {
    signal: new AbortController().signal,
    deadline: Date.now() + 30_000,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    rateLimiter: { async acquire() {} },
    cache: { async get() { return null; }, async set() {} },
    circuitBreaker: { isOpen: () => false, recordSuccess() {}, recordFailure() {} },
    correlationId: "careerjet-test",
  };
}

function keywordQuery(keywords: string, overrides: Partial<Extract<NormalizedQuery, { kind: "keywords" }>> = {}): NormalizedQuery {
  return { kind: "keywords", keywords, location: null, remoteOnly: false, employmentType: "any", ...overrides };
}

async function run(query: NormalizedQuery) {
  requests.length = 0;
  const pages = [];
  for await (const page of careerjetAdapter.search(query, testContext())) pages.push(page);
  const fetchedAt = "2026-01-01T00:00:00.000Z";
  const listings = pages.flatMap((page) => page.items.map((item) => careerjetAdapter.normalize(item, { fetchedAt, query })));
  return { pages, listings, sent: requests.map((request) => ({ params: new URL(request.url).searchParams, auth: request.headers.get("authorization") })) };
}

describe("careerjet adapter", () => {
  it("any mode sends one authenticated en_US request with the required user fields and no contract_type", async () => {
    const { sent, listings } = await run(keywordQuery("network engineer", { location: "Atlanta, GA" }));

    expect(sent).toHaveLength(1);
    const [{ params, auth }] = sent;
    expect(auth).toBe("Basic dGVzdC1rZXk6"); // base64("test-key:") — key as username, empty password
    expect(params.get("locale_code")).toBe("en_US");
    expect(params.get("user_ip")).toBe("127.0.0.1");
    expect(params.get("user_agent")).toMatch(/Serpo/);
    expect(params.get("keywords")).toBe("network engineer");
    expect(params.get("location")).toBe("Atlanta, GA");
    expect(params.has("contract_type")).toBe(false);
    expect(listings.map((listing) => listing.employment.type)).toEqual([null, null]);
  });

  it("omits location for a country-wide search", async () => {
    const { sent } = await run(keywordQuery("network engineer"));
    expect(sent[0].params.has("location")).toBe(false);
  });

  it("contract mode requests contract and temporary separately and types each listing by the filter that returned it", async () => {
    const { sent, listings } = await run(keywordQuery("network engineer", { employmentType: "contract" }));

    expect(sent.map(({ params }) => params.get("contract_type"))).toEqual(["c", "t"]);
    expect(listings.map((listing) => [listing.title, listing.employment.type])).toEqual([
      ["Network Engineer", "contract"],
      ["NOC Technician", "temporary"],
    ]);
  });

  it("an unresolved location yields one empty page with a warning naming Careerjet's candidates", async () => {
    const { pages, sent } = await run(keywordQuery("LOCATION_TEST", { location: "Atlanta", employmentType: "contract" }));

    expect(sent).toHaveLength(1); // the temporary request would hit the same unresolvable location
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toEqual([]);
    expect(pages[0].warning).toContain("multiple locations found");
    expect(pages[0].warning).toContain("Atlanta, GA; Atlanta, TX");
  });

  it("rejects non-2xx responses with the HTTP-status prefix runSearch classifies on", async () => {
    await expect(run(keywordQuery("ERROR_TEST"))).rejects.toThrow("HTTP 403: Careerjet search failed");
  });

  it("normalizes the documented date and salary formats", async () => {
    const { listings } = await run(keywordQuery("network engineer"));
    const [hourly, weekly] = listings;

    expect(hourly.postedAt).toBe("2025-11-15T19:13:43.000Z");
    expect(hourly.sourceJobId).toBe(hourly.canonicalUrl);
    expect(hourly.idIsDerived).toBe(true);
    expect(hourly.compensation).toEqual({ min: 30, max: 45, currency: "USD", period: "hour", isEstimate: false });
    // The schema has no weekly period, so the figure stays but its period is unknown.
    expect(weekly.compensation.period).toBeNull();
  });
});
