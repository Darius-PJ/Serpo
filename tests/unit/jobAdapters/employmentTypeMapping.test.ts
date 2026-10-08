import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer } from "@/tests/setup/mswServer";
import { loadFixture } from "@/tests/fixtures/loadFixture";
import { adzunaAdapter } from "@/lib/jobAdapters/adapters/adzuna";
import { arbeitnowAdapter } from "@/lib/jobAdapters/adapters/arbeitnow";
import { himalayasAdapter } from "@/lib/jobAdapters/adapters/himalayas";
import { jobicyAdapter } from "@/lib/jobAdapters/adapters/jobicy";
import { joobleAdapter } from "@/lib/jobAdapters/adapters/jooble";
import { usaJobsAdapter } from "@/lib/jobAdapters/adapters/usajobs";
import { employmentTypeFromLabels } from "@/lib/jobAdapters/services/employmentLabels";
import type { Adapter, AdapterContext, NormalizedQuery } from "@/lib/jobAdapters/types";

type RawOf<A> = A extends Adapter<infer T> ? T : never;

const fetchedAt = "2026-01-01T00:00:00.000Z";

function keywordQuery(employmentType: "any" | "contract"): NormalizedQuery {
  return { kind: "keywords", keywords: "network engineer", location: null, remoteOnly: false, employmentType };
}

function testContext(): AdapterContext {
  return {
    signal: new AbortController().signal,
    deadline: Date.now() + 30_000,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    rateLimiter: { async acquire() {} },
    cache: { async get() { return null; }, async set() {} },
    circuitBreaker: { isOpen: () => false, recordSuccess() {}, recordFailure() {} },
    correlationId: "employment-type-test",
  };
}

// Distinct [raw label, mapped type] pairs across a fixture's items.
function mappings<T>(adapter: Adapter<T>, items: T[], label: (item: T) => unknown, query = keywordQuery("any")) {
  const pairs = items.map((item) => JSON.stringify([label(item), adapter.normalize(item, { fetchedAt, query }).employment.type]));
  return [...new Set(pairs)].map((pair) => JSON.parse(pair));
}

function fixtureBody<T>(source: string, name: string): T {
  return loadFixture(source, name).body as T;
}

const adzunaItems = fixtureBody<{ results: RawOf<typeof adzunaAdapter>[] }>("adzuna", "typical").results;
const usaJobsItems = fixtureBody<{ SearchResult: { SearchResultItems: RawOf<typeof usaJobsAdapter>[] } }>("usajobs", "contract-filter").SearchResult.SearchResultItems;

describe("normalize maps each source's own type labels (real fixtures)", () => {
  it("adzuna: contract_type contract wins over contract_time; otherwise contract_time decides", () => {
    expect(mappings(adzunaAdapter, adzunaItems, (item) => [item.contract_type ?? null, item.contract_time ?? null])).toEqual([
      [[null, "full_time"], "full-time"],
      [["contract", "full_time"], "contract"],
      [[null, null], null],
    ]);
  });

  it("himalayas: Contractor is contract", () => {
    const { jobs } = fixtureBody<{ jobs: RawOf<typeof himalayasAdapter>[] }>("himalayas", "typical");
    expect(mappings(himalayasAdapter, jobs, (job) => job.employmentType)).toEqual([
      ["Full Time", "full-time"],
      ["Contractor", "contract"],
    ]);
  });

  it("jobicy: jobType array", () => {
    const { jobs } = fixtureBody<{ jobs: RawOf<typeof jobicyAdapter>[] }>("jobicy", "typical");
    expect(mappings(jobicyAdapter, jobs, (job) => job.jobType)).toEqual([[["Full-Time"], "full-time"]]);
  });

  it("arbeitnow: experience levels and internships are not employment types", () => {
    const { data } = fixtureBody<{ data: RawOf<typeof arbeitnowAdapter>[] }>("arbeitnow", "typical");
    expect(mappings(arbeitnowAdapter, data, (job) => job.job_types)).toEqual([
      [[], null],
      [["berufserfahren"], null],
      [["Internship", "hilfstätigkeit / student"], null],
    ]);
  });

  it("jooble: type string, mostly empty", () => {
    const { jobs } = fixtureBody<{ jobs: RawOf<typeof joobleAdapter>[] }>("jooble", "typical");
    expect(mappings(joobleAdapter, jobs, (job) => job.type)).toEqual([
      ["", null],
      ["Full-time", "full-time"],
    ]);
  });

  it("usajobs: Temporary/Term offering codes are temporary even when Name is blank or free text", () => {
    expect(mappings(usaJobsAdapter, usaJobsItems, (item) => item.MatchedObjectDescriptor.PositionOfferingType)).toEqual([
      [[{ Name: "NTE two and 1/2 years", Code: "15319" }], "temporary"],
      [[{ Name: "", Code: "15318" }], "temporary"],
      [[{ Name: "Indefinite", Code: "15318" }], "temporary"],
      [[{ Name: "Indefinite Appointment - Excepted Service", Code: "15318" }], "temporary"],
    ]);
  });

  it("usajobs: a permanent offering falls back to the schedule code", () => {
    const base = usaJobsItems[0];
    const permanent = { MatchedObjectDescriptor: { ...base.MatchedObjectDescriptor, PositionOfferingType: [{ Name: "", Code: "15317" }] } };
    expect(usaJobsAdapter.normalize(permanent, { fetchedAt, query: keywordQuery("any") }).employment.type).toBe("full-time");
  });
});

describe("employmentTypeFromLabels", () => {
  it.each([
    // Arbeitnow job_types seen live (2026-09-27): free text mixing type, term and level.
    [["fulltime fixed term"], "temporary"],
    [["fulltime permanent"], "full-time"],
    [["Permanent"], null],
    [["Experienced", "Part time"], "part-time"],
    // Precedence across labels: contract beats temporary beats full-time.
    [["Full-Time", "Contract"], "contract"],
    [["Temporary", "Full Time"], "temporary"],
    // European phrasing for a permanent hire.
    [["Full-time permanent contract"], "full-time"],
  ] as const)("%j -> %s", (labels, expected) => {
    expect(employmentTypeFromLabels(labels)).toBe(expected);
  });
});

describe("server-side contract filters", () => {
  const sent: URL[] = [];

  beforeAll(() => {
    vi.stubEnv("ADZUNA_APP_ID", "test-id");
    vi.stubEnv("ADZUNA_APP_KEY", "test-key");
    vi.stubEnv("USAJOBS_API_KEY", "test-key");
    vi.stubEnv("USAJOBS_USER_AGENT", "test@example.com");
    startMswServer();
    mswServer.use(
      http.get("https://api.adzuna.com/v1/api/jobs/us/search/1", ({ request }) => {
        sent.push(new URL(request.url));
        return HttpResponse.json(loadFixture("adzuna", "typical").body);
      }),
      http.get("https://data.usajobs.gov/api/search", ({ request }) => {
        sent.push(new URL(request.url));
        return HttpResponse.json(loadFixture("usajobs", "contract-filter").body);
      }),
      http.get("https://himalayas.app/jobs/api/search", ({ request }) => {
        sent.push(new URL(request.url));
        return HttpResponse.json(loadFixture("himalayas", "typical").body);
      })
    );
  });

  afterAll(() => {
    stopMswServer();
    vi.unstubAllEnvs();
  });

  async function run<T>(adapter: Adapter<T>, query: NormalizedQuery) {
    sent.length = 0;
    const listings = [];
    for await (const page of adapter.search(query, testContext())) {
      listings.push(...page.items.map((item) => adapter.normalize(item, { fetchedAt, query })));
    }
    return { params: sent[0].searchParams, types: listings.map((listing) => listing.employment.type) };
  }

  it("adzuna sends contract=1 only in contract mode, and stamps results lacking contract_type", async () => {
    const any = await run(adzunaAdapter, keywordQuery("any"));
    expect(any.params.has("contract")).toBe(false);
    expect(new Set(any.types)).toEqual(new Set(["full-time", "contract", null]));

    const contract = await run(adzunaAdapter, keywordQuery("contract"));
    expect(contract.params.get("contract")).toBe("1");
    expect(new Set(contract.types)).toEqual(new Set(["contract"]));
  });

  it("usajobs requests the Temporary and Term offering codes only in contract mode", async () => {
    expect((await run(usaJobsAdapter, keywordQuery("any"))).params.has("PositionOfferingTypeCode")).toBe(false);
    expect((await run(usaJobsAdapter, keywordQuery("contract"))).params.get("PositionOfferingTypeCode")).toBe("15318;15319");
  });

  it("usajobs stamps a filtered result without an offering type as temporary, but not an unfiltered one", () => {
    const base = usaJobsItems[0];
    const untyped = { MatchedObjectDescriptor: { ...base.MatchedObjectDescriptor, PositionOfferingType: [] } };
    expect(usaJobsAdapter.normalize(untyped, { fetchedAt, query: keywordQuery("contract") }).employment.type).toBe("temporary");
    expect(usaJobsAdapter.normalize(untyped, { fetchedAt, query: keywordQuery("any") }).employment.type).toBe("full-time");
  });

  it("himalayas asks for Contractor and Temporary only in contract mode", async () => {
    expect((await run(himalayasAdapter, keywordQuery("any"))).params.has("employment_type")).toBe(false);
    expect((await run(himalayasAdapter, keywordQuery("contract"))).params.get("employment_type")).toBe("Contractor,Temporary");
  });
});
