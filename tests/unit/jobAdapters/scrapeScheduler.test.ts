import { beforeEach, describe, expect, it, vi } from "vitest";
const disk = vi.hoisted(() => ({ saved: "{}" }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(), rename: vi.fn(),
  readFile: vi.fn(async () => disk.saved),
  writeFile: vi.fn(async (_path: string, value: string) => { disk.saved = value; }),
}));
import { scheduleScrape, resetScrapeSchedulerForTests } from "@/lib/jobAdapters/services/scrapeScheduler";

const options = (site: string, key = "same") => ({ site, key, minIntervalMs: 60_000, signal: new AbortController().signal, cooldown: () => null });

beforeEach(() => { resetScrapeSchedulerForTests(); disk.saved = "{}"; });

describe("shared scrape scheduler", () => {
  it("joins duplicate requests and serializes different boards", async () => {
    let release!: () => void;
    const firstRun = vi.fn(() => new Promise<string>((resolve) => { release = () => resolve("jobs"); }));
    const secondRun = vi.fn(async () => "other jobs");
    const first = scheduleScrape({ ...options("google"), run: firstRun });
    const duplicate = scheduleScrape({ ...options("google"), run: firstRun });
    const second = scheduleScrape({ ...options("indeed"), run: secondRun });
    await vi.waitFor(() => expect(firstRun).toHaveBeenCalledTimes(1));
    expect(secondRun).not.toHaveBeenCalled();
    release();
    expect(await Promise.all([first, duplicate, second])).toEqual(["jobs", "jobs", "other jobs"]);
    expect(firstRun).toHaveBeenCalledTimes(1);
  });

  it("blocks different queries to the same board and retains limits after restart", async () => {
    const run = vi.fn(async () => "jobs");
    await scheduleScrape({ ...options("linkedin"), run });
    resetScrapeSchedulerForTests();
    await expect(scheduleScrape({ ...options("linkedin", "different"), run })).rejects.toThrow("Paused until");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("persists a long block for one board without blocking others", async () => {
    const start = Date.now();
    await scheduleScrape({ ...options("google"), run: async () => "429", cooldown: () => ({ milliseconds: 3_600_000, reason: "Rate limited." }) });
    expect(JSON.parse(disk.saved).google.until).toBeGreaterThanOrEqual(start + 3_600_000);
    await expect(scheduleScrape({ ...options("google", "new"), run: async () => "unexpected" })).rejects.toThrow("Rate limited");
    expect(await scheduleScrape({ ...options("indeed"), run: async () => "jobs" })).toBe("jobs");
  });

  it("does not run an expired queued request and recovers after a subprocess failure", async () => {
    await expect(scheduleScrape({ ...options("google"), run: async () => { throw new Error("crashed"); } })).rejects.toThrow("crashed");
    const controller = new AbortController(); controller.abort();
    const run = vi.fn();
    await expect(scheduleScrape({ ...options("indeed"), signal: controller.signal, run })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(await scheduleScrape({ ...options("glassdoor"), run: async () => "jobs" })).toBe("jobs");
  });
});
