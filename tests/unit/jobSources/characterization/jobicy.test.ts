import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { jobicyConnector } from "@/lib/jobSources/jobicy";

const JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("jobicyConnector (characterization)", () => {
  it("matches today's normalized shape for a typical result page", async () => {
    const fixture = loadFixture("jobicy", "typical");
    mswServer.use(http.get(JOBICY_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await jobicyConnector.search({ keywords: "engineer" });
    expect(result).toMatchSnapshot();
  });

  it("returns an empty array for a genuinely empty result set, not a throw", async () => {
    const fixture = loadFixture("jobicy", "empty");
    mswServer.use(http.get(JOBICY_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await jobicyConnector.search({ keywords: "zzzznonexistentjobtitle999999" });
    expect(result).toEqual([]);
  });

  it("throws on a real captured 400 (free-text geo isn't accepted, per lib/jobSources/jobicy.ts's own comment)", async () => {
    const fixture = loadFixture("jobicy", "error");
    mswServer.use(http.get(JOBICY_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    await expect(jobicyConnector.search({ keywords: "engineer" })).rejects.toThrow(/Jobicy search failed: 400/);
  });
});
