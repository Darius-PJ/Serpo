// No typical/empty fixture: ~40 real companies commonly associated with Lever were
// live-checked and none resolved to a currently-live board (see
// tests/fixtures/lever/typical-not-found.json) — not fabricating one instead. Only the
// genuine 404 case (a real, verifiable behavior) is characterized here.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { fetchLeverBoard } from "@/lib/jobSources/leverBoard";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("fetchLeverBoard (characterization)", () => {
  it("throws on a real captured 404 for a nonexistent board token", async () => {
    const fixture = loadFixture("lever", "error");
    mswServer.use(
      http.get("https://api.lever.co/v0/postings/this-company-definitely-does-not-exist-12345", () =>
        HttpResponse.json(fixture.body, { status: fixture.status })
      )
    );

    await expect(fetchLeverBoard("this-company-definitely-does-not-exist-12345", { keywords: "engineer" })).rejects.toThrow(
      /Lever board .* search failed: 404/
    );
  });
});
