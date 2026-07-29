import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { himalayasConnector } from "@/lib/jobSources/himalayas";

const HIMALAYAS_URL = "https://himalayas.app/jobs/api/search";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("himalayasConnector (characterization)", () => {
  it("matches today's normalized shape for a typical result page", async () => {
    const fixture = loadFixture("himalayas", "typical");
    mswServer.use(http.get(HIMALAYAS_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await himalayasConnector.search({ keywords: "engineer" });
    expect(result).toMatchSnapshot();
  });

  // See tests/fixtures/himalayas/FINDING-search-param-not-filtering.json: a live check
  // found `q` doesn't reliably filter server-side — a nonsense keyword still returned
  // 19 unrelated real jobs. The connector has no way to detect this (it just maps
  // whatever comes back), so this documents that reality rather than asserting an
  // "empty" result the API doesn't actually produce.
  it("maps whatever the upstream returns, even when the query didn't actually filter (documented finding, not a bug in this connector)", async () => {
    const fixture = loadFixture("himalayas", "not-empty-search-not-filtering");
    mswServer.use(http.get(HIMALAYAS_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await himalayasConnector.search({ keywords: "zzzznonexistentjobtitle999999" });
    expect(result.length).toBeGreaterThan(0);
  });

  it("throws on a real captured 400 (free-text country isn't accepted, per lib/jobSources/himalayas.ts's own comment)", async () => {
    const fixture = loadFixture("himalayas", "error");
    mswServer.use(http.get(HIMALAYAS_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    await expect(himalayasConnector.search({ keywords: "engineer" })).rejects.toThrow(/Himalayas search failed: 400/);
  });
});
