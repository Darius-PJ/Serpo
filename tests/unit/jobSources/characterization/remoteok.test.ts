// No error fixture: a live check found RemoteOK does NOT block a generic User-Agent as
// its own code comment claims (see tests/fixtures/remoteok/error-not-reproduced.json) —
// not fabricating one instead.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { remoteOkConnector } from "@/lib/jobSources/remoteOk";

const REMOTEOK_URL = "https://remoteok.com/api";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("remoteOkConnector (characterization)", () => {
  it("matches today's normalized shape for a typical result page, and drops the index-0 legal notice", async () => {
    const fixture = loadFixture("remoteok", "typical");
    mswServer.use(http.get(REMOTEOK_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await remoteOkConnector.search({ keywords: "engineer" });
    expect(result).toMatchSnapshot();
  });

  it("full dump + local filter yields an empty array for a keyword nothing matches (no server-side query exists for this source)", async () => {
    const fixture = loadFixture("remoteok", "typical");
    mswServer.use(http.get(REMOTEOK_URL, () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await remoteOkConnector.search({ keywords: "zzzznonexistentjobtitle999999" });
    expect(result).toEqual([]);
  });
});
