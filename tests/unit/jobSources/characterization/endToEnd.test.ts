// Golden end-to-end characterization (Phase 1): snapshots searchAllSources()'s real
// output for a representative query, with every reachable source's real captured
// response replayed via MSW. This is the "before" the Phase 4 migration must not
// silently change. Env vars are set explicitly here (not inherited from .env.local) so
// this test is deterministic and portable across machines/CI, independent of which
// keys happen to be configured locally.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer, startMswServer, stopMswServer, resetMswHandlers } from "../../../setup/mswServer";
import { loadFixture } from "../../../fixtures/loadFixture";
import { searchAllSources } from "@/lib/jobSources";

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => startMswServer());
afterEach(() => resetMswHandlers());
afterAll(() => stopMswServer());

beforeEach(() => {
  process.env.ADZUNA_APP_ID = "test-app-id";
  process.env.ADZUNA_APP_KEY = "test-app-key";
  delete process.env.JOOBLE_API_KEY;
  delete process.env.USAJOBS_API_KEY;
  delete process.env.USAJOBS_USER_AGENT;
  // Forces jobSpy's spawn() to fail fast and deterministically (ENOENT) regardless of
  // whether python-jobspy happens to be installed on whatever machine runs this.
  process.env.JOBSPY_PYTHON = "definitely-not-a-real-python-binary-xyz";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function registerTypicalHandlers() {
  mswServer.use(
    http.get("https://api.adzuna.com/v1/api/jobs/us/search/1", () => {
      const fixture = loadFixture("adzuna", "typical");
      return HttpResponse.json(fixture.body, { status: fixture.status });
    }),
    http.get("https://remoteok.com/api", () => {
      const fixture = loadFixture("remoteok", "typical");
      return HttpResponse.json(fixture.body, { status: fixture.status });
    }),
    http.get("https://remotive.com/api/remote-jobs", () => {
      const fixture = loadFixture("remotive", "typical");
      return HttpResponse.json(fixture.body, { status: fixture.status });
    }),
    http.get("https://himalayas.app/jobs/api/search", () => {
      const fixture = loadFixture("himalayas", "typical");
      return HttpResponse.json(fixture.body, { status: fixture.status });
    }),
    http.get("https://jobicy.com/api/v2/remote-jobs", () => {
      const fixture = loadFixture("jobicy", "typical");
      return HttpResponse.json(fixture.body, { status: fixture.status });
    }),
    http.get("https://www.arbeitnow.com/api/job-board-api", () => {
      const fixture = loadFixture("arbeitnow", "typical");
      return HttpResponse.json(fixture.body, { status: fixture.status });
    })
  );
}

describe("searchAllSources (golden end-to-end characterization)", () => {
  it("snapshots today's real, per-source-grouped output for a representative query", async () => {
    registerTypicalHandlers();

    const results = await searchAllSources({ keywords: "engineer" });
    // Sort by source for a stable snapshot — Promise.all's settling order isn't guaranteed.
    const sorted = [...results].sort((a, b) => a.source.localeCompare(b.source));
    expect(sorted).toMatchSnapshot();
  });

  it("degrades gracefully: jobspy (subprocess unavailable) produces a per-source error, not a failed search", async () => {
    registerTypicalHandlers();

    const results = await searchAllSources({ keywords: "engineer" });
    const jobspyResult = results.find((r) => r.source === "jobspy");
    expect(jobspyResult).toBeDefined();
    expect(jobspyResult?.listings).toEqual([]);
    expect(jobspyResult?.error).toBeTruthy();
  });

  it("excludes unconfigured sources (usajobs, jooble) entirely rather than erroring on them", async () => {
    registerTypicalHandlers();

    const results = await searchAllSources({ keywords: "engineer" });
    expect(results.find((r) => r.source === "usajobs")).toBeUndefined();
    expect(results.find((r) => r.source === "jooble")).toBeUndefined();
  });
});
