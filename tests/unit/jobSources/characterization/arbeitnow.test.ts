// No error fixture: a live check against a wrong path returned 200 with different but
// real data (see tests/fixtures/arbeitnow/error-not-reproduced.json), not a genuine
// error — not fabricating one instead.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { arbeitnowConnector } from "@/lib/jobSources/arbeitnow";

const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("arbeitnowConnector (characterization)", () => {
  it("matches today's normalized shape for a typical result page", async () => {
    const fixture = loadFixture("arbeitnow", "typical");
    mswServer.use(http.get(ARBEITNOW_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await arbeitnowConnector.search({ keywords: "engineer" });
    expect(result).toMatchSnapshot();
  });

  it("full dump + local filter yields an empty array for a keyword nothing matches (no server-side query exists for this source)", async () => {
    const fixture = loadFixture("arbeitnow", "typical");
    mswServer.use(http.get(ARBEITNOW_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await arbeitnowConnector.search({ keywords: "zzzznonexistentjobtitle999999" });
    expect(result).toEqual([]);
  });
});
