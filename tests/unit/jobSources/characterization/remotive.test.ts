import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { remotiveConnector } from "@/lib/jobSources/remotive";

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("remotiveConnector (characterization)", () => {
  it("matches today's normalized shape for a typical result page", async () => {
    const fixture = loadFixture("remotive", "typical");
    mswServer.use(http.get(REMOTIVE_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await remotiveConnector.search({ keywords: "engineer" });
    expect(result).toMatchSnapshot();
  });

  // See tests/fixtures/remotive/FINDING-search-param-not-filtering.json: a live check
  // found `search` doesn't reliably filter server-side — a nonsense keyword returned
  // the identical job set as "engineer" did. This documents that reality (the fixture
  // itself is real, captured data) rather than asserting a filter this API doesn't
  // actually perform.
  it("maps the upstream response even when the query didn't actually filter (documented finding, not a bug in this connector)", async () => {
    const fixture = loadFixture("remotive", "empty");
    mswServer.use(http.get(REMOTIVE_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await remotiveConnector.search({ keywords: "zzzznonexistentjobtitle999999" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("throws on a real captured 404", async () => {
    const fixture = loadFixture("remotive", "error");
    mswServer.use(http.get(REMOTIVE_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    await expect(remotiveConnector.search({ keywords: "engineer" })).rejects.toThrow(/Remotive search failed: 404/);
  });
});
