// Greenhouse isn't in the static CONNECTORS registry (it's a per-account board
// integration, lib/jobSources/searchPoolBoards.ts) — characterizing
// fetchGreenhouseBoard() directly, the same function that path calls.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { fetchGreenhouseBoard } from "@/lib/jobSources/greenhouseBoard";

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

describe("fetchGreenhouseBoard (characterization)", () => {
  it("matches today's normalized shape for a real board (Stripe's public Greenhouse board)", async () => {
    const fixture = loadFixture("greenhouse", "typical");
    mswServer.use(http.get("https://boards-api.greenhouse.io/v1/boards/stripe/jobs", () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await fetchGreenhouseBoard("stripe", { keywords: "engineer" });
    expect(result).toMatchSnapshot();
  });

  it("full board dump + local title filter yields an empty array for a keyword nothing matches (no server-side query exists for this source)", async () => {
    const fixture = loadFixture("greenhouse", "typical");
    mswServer.use(http.get("https://boards-api.greenhouse.io/v1/boards/stripe/jobs", () => HttpResponse.json(fixture.body, { status: fixture.status })));

    const result = await fetchGreenhouseBoard("stripe", { keywords: "zzzznonexistentjobtitle999999" });
    expect(result).toEqual([]);
  });

  it("throws on a real captured 404 for a nonexistent board token", async () => {
    const fixture = loadFixture("greenhouse", "error");
    mswServer.use(
      http.get("https://boards-api.greenhouse.io/v1/boards/this-company-definitely-does-not-exist-12345/jobs", () =>
        HttpResponse.json(fixture.body, { status: fixture.status })
      )
    );

    await expect(fetchGreenhouseBoard("this-company-definitely-does-not-exist-12345", { keywords: "engineer" })).rejects.toThrow(
      /Greenhouse board .* search failed: 404/
    );
  });
});
