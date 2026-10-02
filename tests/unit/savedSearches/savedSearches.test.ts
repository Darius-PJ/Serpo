import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { Cadence } from "@/lib/automation/cadence";
import { enqueueJob, savedSearchJobKeyPrefix } from "@/lib/automation/jobs";
import { addEliminatedJob } from "@/lib/jobSources/eliminatedJobs";
import type { JobSearchCriteria, NormalizedJobListing } from "@/lib/jobSources/types";

// Only the network edge is mocked: the real filters, SimHash dedupe, and
// tracked/eliminated exclusion run on these listings.
const searchAllAdaptersMock = vi.hoisted(() => vi.fn());
const searchPoolBoardAdaptersMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/jobAdapters/search", () => ({
  searchAllAdapters: searchAllAdaptersMock,
  searchPoolBoardAdapters: searchPoolBoardAdaptersMock,
}));

import {
  createSavedSearch,
  deleteSavedSearch,
  dismissSavedSearchHit,
  listNewListingCounts,
  listSavedSearches,
  listSavedSearchHits,
  markSavedSearchViewed,
  runSavedSearch,
  SavedSearchInputError,
  updateSavedSearch,
} from "@/lib/savedSearches/savedSearches";

const MINUTE_MS = 60_000;

let seq = 0;
async function makeUser() {
  seq++;
  return prisma.user.create({ data: { username: `saved-search-user-${seq}`, passwordHash: "unused" } });
}

function makeSearch(userId: string, criteria: Partial<JobSearchCriteria> = {}, cadence: Cadence = "daily") {
  return createSavedSearch(userId, {
    name: "Remote frontend",
    criteria: { keywords: "frontend engineer", jobSpySites: [], ...criteria },
    cadence,
  });
}

// Remotive is remote-only, so its listings pass the US-or-remote filter.
function listing(n: number, overrides: Partial<NormalizedJobListing> = {}): NormalizedJobListing {
  return {
    id: `remotive:${n}`,
    source: "remotive",
    company: `Company ${n}`,
    role: "Frontend Engineer",
    url: `https://remotive.test/jobs/${n}`,
    // Words no other listing shares, so dedupe keeps each listing in its own family.
    description: Array.from({ length: 40 }, (_, word) => `posting${n}word${word}`).join(" "),
    ...overrides,
  };
}

/** The same posting under a new id and URL: dedupe files it in the original's family. */
function repost(original: NormalizedJobListing, n: number): NormalizedJobListing {
  return { ...original, id: `remotive:${n}`, url: `https://remotive.test/jobs/${n}` };
}

function sourcesReturn(...listings: NormalizedJobListing[]) {
  searchAllAdaptersMock.mockResolvedValue([{ source: "remotive", label: "Remotive", listings }]);
}

describe("saved searches", () => {
  beforeEach(() => {
    // Hits are new when first seen after the inbox was last viewed; a
    // controlled clock keeps each step strictly after the one before it.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
    searchAllAdaptersMock.mockReset();
    searchPoolBoardAdaptersMock.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("records every listing of a first run as new, and none again when a rerun returns them", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id);
    sourcesReturn(listing(1), listing(2), listing(3));
    vi.advanceTimersByTime(MINUTE_MS);
    const firstRunAt = new Date();

    await expect(runSavedSearch(user.id, search.id)).resolves.toEqual({
      newHits: 3,
      listings: 3,
      failedSources: [],
      allSourcesFailed: false,
    });
    vi.advanceTimersByTime(MINUTE_MS);
    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({ newHits: 0, listings: 3 });

    const hits = await listSavedSearchHits(user.id, search.id);
    expect(hits?.map((hit) => [hit.listing.id, hit.isNew]).sort()).toEqual([
      ["remotive:1", true],
      ["remotive:2", true],
      ["remotive:3", true],
    ]);
    expect(hits?.find((hit) => hit.listing.id === "remotive:1")?.listing).toMatchObject(listing(1));
    await expect(listNewListingCounts(user.id)).resolves.toEqual([
      { savedSearchId: search.id, name: "Remote frontend", count: 3, oldestAt: firstRunAt },
    ]);
  });

  it("does not count a repost of a listing it already recorded as new", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id);
    const original = listing(1);
    sourcesReturn(original);
    vi.advanceTimersByTime(MINUTE_MS);
    await runSavedSearch(user.id, search.id);

    sourcesReturn(repost(original, 2), listing(3));
    vi.advanceTimersByTime(MINUTE_MS);
    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({ newHits: 1 });

    const hits = await listSavedSearchHits(user.id, search.id);
    expect(hits?.map((hit) => hit.listing.id).sort()).toEqual(["remotive:1", "remotive:3"]);
  });

  it("never records a listing the user tracks or eliminated, and drops a hit tracked or eliminated later", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id);
    const [tracked, eliminated, trackedLater, eliminatedLater] = [listing(1), listing(2), listing(3), listing(4)];
    const track = (job: NormalizedJobListing) =>
      prisma.application.create({ data: { userId: user.id, company: job.company, role: job.role, source: job.source, url: job.url } });
    await track(tracked);
    await addEliminatedJob(user.id, { url: eliminated.url });
    sourcesReturn(tracked, eliminated, trackedLater, eliminatedLater);
    vi.advanceTimersByTime(MINUTE_MS);

    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({ newHits: 2 });
    const recorded = await prisma.savedSearchHit.findMany({ where: { savedSearchId: search.id }, select: { url: true } });
    expect(recorded.map((hit) => hit.url).sort()).toEqual([trackedLater.url, eliminatedLater.url].sort());
    await expect(listNewListingCounts(user.id)).resolves.toMatchObject([{ count: 2 }]);

    await track(trackedLater);
    await addEliminatedJob(user.id, { url: eliminatedLater.url });

    await expect(listNewListingCounts(user.id)).resolves.toEqual([]);
    await expect(listSavedSearchHits(user.id, search.id)).resolves.toEqual([]);
  });

  it("hides a dismissed hit, which still keeps a repost from counting as new", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id);
    const original = listing(1);
    sourcesReturn(original);
    vi.advanceTimersByTime(MINUTE_MS);
    await runSavedSearch(user.id, search.id);
    const [hit] = (await listSavedSearchHits(user.id, search.id)) ?? [];

    await expect(dismissSavedSearchHit(user.id, search.id, hit.id)).resolves.toBe(true);
    await expect(listSavedSearchHits(user.id, search.id)).resolves.toEqual([]);
    await expect(listNewListingCounts(user.id)).resolves.toEqual([]);

    sourcesReturn(repost(original, 2));
    vi.advanceTimersByTime(MINUTE_MS);
    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({ newHits: 0 });
    await expect(listSavedSearchHits(user.id, search.id)).resolves.toEqual([]);
  });

  it("stops counting hits as new once the inbox is viewed, and counts later ones again", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id);
    sourcesReturn(listing(1), listing(2));
    vi.advanceTimersByTime(MINUTE_MS);
    await runSavedSearch(user.id, search.id);

    vi.advanceTimersByTime(MINUTE_MS);
    await expect(markSavedSearchViewed(user.id, search.id)).resolves.toBe(true);
    await expect(listSavedSearches(user.id)).resolves.toMatchObject([{ id: search.id, newCount: 0 }]);
    await expect(listNewListingCounts(user.id)).resolves.toEqual([]);

    sourcesReturn(listing(1), listing(2), listing(3));
    vi.advanceTimersByTime(MINUTE_MS);
    await runSavedSearch(user.id, search.id);

    await expect(listSavedSearches(user.id)).resolves.toMatchObject([{ id: search.id, newCount: 1 }]);
    const hits = await listSavedSearchHits(user.id, search.id);
    expect(hits?.map((hit) => [hit.listing.id, hit.isNew]).sort()).toEqual([
      ["remotive:1", false],
      ["remotive:2", false],
      ["remotive:3", true],
    ]);
  });

  it("rejects a six-hourly cadence for a search with JobSpy boards, on create and on update", async () => {
    const user = await makeUser();

    await expect(makeSearch(user.id, { jobSpySites: ["indeed"] }, "every_6h")).rejects.toBeInstanceOf(SavedSearchInputError);
    await expect(prisma.savedSearch.count({ where: { userId: user.id } })).resolves.toBe(0);

    const withBoards = await makeSearch(user.id, { jobSpySites: ["indeed"] }, "daily");
    await expect(updateSavedSearch(user.id, withBoards.id, { cadence: "every_6h" })).rejects.toBeInstanceOf(SavedSearchInputError);
    await expect(prisma.savedSearch.findUnique({ where: { id: withBoards.id } })).resolves.toMatchObject({ cadence: "daily" });

    // Without JobSpy boards six-hourly is fine.
    await expect(makeSearch(user.id, {}, "every_6h")).resolves.toMatchObject({ cadence: "every_6h" });
  });

  it("scrapes only consented JobSpy boards unattended and skips a paused search, while Run now uses every selected board", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id, { jobSpySites: ["indeed", "linkedin", "google"] });
    sourcesReturn(listing(1));

    await runSavedSearch(user.id, search.id, { unattended: { jobSpyConsent: ["indeed", "zip_recruiter", "google"] } });
    await runSavedSearch(user.id, search.id);

    expect(searchAllAdaptersMock.mock.calls.map(([criteria]) => criteria.jobSpySites)).toEqual([
      ["indeed", "google"],
      ["indeed", "linkedin", "google"],
    ]);

    await updateSavedSearch(user.id, search.id, { enabled: false });
    await expect(runSavedSearch(user.id, search.id, { unattended: { jobSpyConsent: ["indeed"] } })).resolves.toBeNull();
    expect(searchAllAdaptersMock).toHaveBeenCalledTimes(2);
  });

  it("reports allSourcesFailed only when every source errored and nothing came back", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id);
    const failed = { source: "remotive", label: "Remotive", listings: [], error: "HTTP 503" };

    searchAllAdaptersMock.mockResolvedValueOnce([failed, { source: "jobicy", label: "Jobicy", listings: [], error: "timed out" }]);
    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({
      allSourcesFailed: true,
      failedSources: ["Remotive", "Jobicy"],
    });

    // Another source answered, with nothing new.
    searchAllAdaptersMock.mockResolvedValueOnce([failed, { source: "jobicy", label: "Jobicy", listings: [] }]);
    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({ allSourcesFailed: false, failedSources: ["Remotive"] });

    // Every source reported a problem, but one still returned listings.
    const partial = { source: "jobicy", label: "Jobicy", listings: [listing(1, { id: "jobicy:1", source: "jobicy" })], error: "partial results" };
    searchAllAdaptersMock.mockResolvedValueOnce([failed, partial]);
    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({ allSourcesFailed: false, newHits: 1 });

    // No source to ask at all.
    searchAllAdaptersMock.mockResolvedValueOnce([]);
    await expect(runSavedSearch(user.id, search.id)).resolves.toMatchObject({ allSourcesFailed: false });
  });

  it("deleteSavedSearch removes the search's queued runs and no other search's", async () => {
    const user = await makeUser();
    const search = await makeSearch(user.id);
    const other = await makeSearch(user.id);
    for (const { id } of [search, other]) {
      await enqueueJob({
        userId: user.id,
        kind: "saved_search.run",
        idempotencyKey: `${savedSearchJobKeyPrefix(id)}2026-09-28T04:00:00.000Z`,
        payload: { savedSearchId: id },
      });
    }

    await expect(deleteSavedSearch(user.id, search.id)).resolves.toBe(true);

    const jobs = await prisma.automationJob.findMany({ where: { userId: user.id } });
    expect(jobs.map((job) => job.idempotencyKey)).toEqual([`${savedSearchJobKeyPrefix(other.id)}2026-09-28T04:00:00.000Z`]);
    await expect(listSavedSearches(user.id)).resolves.toMatchObject([{ id: other.id }]);
  });

  it("keeps a search invisible to every function another user calls", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const search = await makeSearch(owner.id);
    sourcesReturn(listing(1));
    vi.advanceTimersByTime(MINUTE_MS);
    await runSavedSearch(owner.id, search.id);
    const [hit] = (await listSavedSearchHits(owner.id, search.id)) ?? [];
    searchAllAdaptersMock.mockClear();

    await expect(listSavedSearches(stranger.id)).resolves.toEqual([]);
    await expect(listNewListingCounts(stranger.id)).resolves.toEqual([]);
    await expect(listSavedSearchHits(stranger.id, search.id)).resolves.toBeNull();
    await expect(runSavedSearch(stranger.id, search.id)).resolves.toBeNull();
    await expect(updateSavedSearch(stranger.id, search.id, { name: "Taken over", enabled: false })).resolves.toBeNull();
    await expect(markSavedSearchViewed(stranger.id, search.id)).resolves.toBe(false);
    await expect(dismissSavedSearchHit(stranger.id, search.id, hit.id)).resolves.toBe(false);
    await expect(deleteSavedSearch(stranger.id, search.id)).resolves.toBe(false);

    expect(searchAllAdaptersMock).not.toHaveBeenCalled();
    await expect(listSavedSearches(owner.id)).resolves.toMatchObject([
      { id: search.id, name: "Remote frontend", enabled: true, newCount: 1 },
    ]);
  });
});
