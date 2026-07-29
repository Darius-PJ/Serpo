// Characterization test (Phase 1): the real adzunaConnector, fed a real captured
// response via MSW, replayed with zero live network calls. The snapshot is today's
// "before" — Phase 4's migration must not silently change this shape.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { adzunaConnector } from "@/lib/jobSources/adzuna";

const ADZUNA_URL = "https://api.adzuna.com/v1/api/jobs/us/search/1";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("adzunaConnector (characterization)", () => {
  it("matches today's normalized shape for a typical result page", async () => {
    const fixture = loadFixture("adzuna", "typical");
    mswServer.use(http.get(ADZUNA_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await adzunaConnector.search({ keywords: "engineer" });
    expect(result).toMatchSnapshot();
  });

  it("returns an empty array for a genuinely empty result set, not a throw", async () => {
    const fixture = loadFixture("adzuna", "empty");
    mswServer.use(http.get(ADZUNA_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await adzunaConnector.search({ keywords: "zzzznonexistentjobtitle999999" });
    expect(result).toEqual([]);
  });

  it("throws on a real captured auth error", async () => {
    const fixture = loadFixture("adzuna", "error");
    mswServer.use(http.get(ADZUNA_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    await expect(adzunaConnector.search({ keywords: "engineer" })).rejects.toThrow(/Adzuna search failed: 401/);
  });
});
