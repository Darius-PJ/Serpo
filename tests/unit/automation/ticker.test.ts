import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { JobSearchCriteria, NormalizedJobListing } from "@/lib/jobSources/types";

// Only the network edge is mocked; the saved-search pipeline runs for real.
const searchAllAdaptersMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/jobAdapters/search", () => ({
  searchAllAdapters: searchAllAdaptersMock,
  searchPoolBoardAdapters: vi.fn(async () => []),
}));

import { updateAutomationPreferences } from "@/lib/automation/settings";
import { tick } from "@/lib/automation/ticker";
import { listSavedSearchHits } from "@/lib/savedSearches/savedSearches";

const DAY_MS = 24 * 60 * 60 * 1000;

// RemoteOK is remote-only, so its listings pass the US-or-remote filter.
function listing(role: string, n: number): NormalizedJobListing {
  return {
    id: `remoteok:${n}`,
    source: "remoteok",
    company: `Company ${n}`,
    role,
    url: `https://remoteok.test/jobs/${n}`,
    // Words no other listing shares, so dedupe keeps each listing in its own family.
    description: Array.from({ length: 40 }, (_, word) => `posting${n}word${word}`).join(" "),
  };
}

describe("automation ticker", () => {
  beforeEach(() => {
    searchAllAdaptersMock.mockReset();
    vi.stubEnv("ENABLE_AI_ASSISTANCE", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("catches up on the first tick: each overdue search runs once and the daily stale scan runs; the next tick runs nothing", async () => {
    const user = await prisma.user.create({ data: { username: "ticker-user", passwordHash: "unused" } });
    await updateAutomationPreferences(user.id, { enabled: true, timezone: "America/New_York" });
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const frontend = await prisma.savedSearch.create({
      data: { userId: user.id, name: "Frontend", keywords: "frontend engineer", nextRunAt: weekAgo },
    });
    const backend = await prisma.savedSearch.create({
      data: { userId: user.id, name: "Backend", keywords: "backend engineer", nextRunAt: weekAgo },
    });
    const untouched = await prisma.application.create({
      data: { userId: user.id, company: "Quiet Co", role: "Engineer", source: "manual", lastStatusChangeAt: new Date(Date.now() - 100 * DAY_MS) },
    });
    searchAllAdaptersMock.mockImplementation(async (criteria: JobSearchCriteria) => [
      {
        source: "remoteok",
        label: "RemoteOK",
        listings:
          criteria.keywords === "frontend engineer"
            ? [listing("Frontend Engineer", 1), listing("Frontend Engineer", 2)]
            : [listing("Backend Engineer", 3)],
      },
    ]);

    await tick();

    expect(searchAllAdaptersMock.mock.calls.map(([criteria]) => criteria.keywords).sort()).toEqual([
      "backend engineer",
      "frontend engineer",
    ]);
    await expect(listSavedSearchHits(user.id, frontend.id)).resolves.toHaveLength(2);
    await expect(listSavedSearchHits(user.id, backend.id)).resolves.toHaveLength(1);
    await expect(prisma.application.findUnique({ where: { id: untouched.id } })).resolves.toMatchObject({
      staleFlaggedAt: expect.any(Date),
    });
    const jobs = await prisma.automationJob.findMany({ where: { userId: user.id } });
    expect(jobs.map((job) => [job.kind, job.status]).sort()).toEqual([
      ["followup.scan", "done"],
      ["saved_search.run", "done"],
      ["saved_search.run", "done"],
      ["stale.scan", "done"],
    ]);

    await tick();

    expect(searchAllAdaptersMock).toHaveBeenCalledTimes(2);
  });
});
