import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { AdapterContext } from "@/lib/jobAdapters/types";

// Exercise adapter outcomes with controlled subprocess responses.
const { spawnSyncMock, spawnMock, disk } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(), spawnMock: vi.fn(), disk: { saved: "{}" },
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: spawnSyncMock, spawn: spawnMock };
});
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(), rename: vi.fn(),
  readFile: vi.fn(async () => disk.saved),
  writeFile: vi.fn(async (_path: string, value: string) => { disk.saved = value; }),
}));

// existsSync is the seam for the .venv-jobspy interpreter fallback.
const existsSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: existsSyncMock };
});

import { jobSpyAdapters, resetJobSpyProbeForTests } from "@/lib/jobAdapters/adapters/jobspy";
import { createAdapterContext } from "@/lib/jobAdapters/context";
import { resetScrapeSchedulerForTests } from "@/lib/jobAdapters/services/scrapeScheduler";
const jobSpyAdapter = jobSpyAdapters[0];

describe("jobspy adapter dependency probe", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    vi.unstubAllEnvs();
    vi.useRealTimers();
    resetJobSpyProbeForTests();
  });

  it("reports unconfigured when the Python jobspy package is missing", () => {
    spawnSyncMock.mockReturnValue({ status: 1 });
    expect(jobSpyAdapter.isConfigured()).toBe(false);
  });

  it("reports configured when the probe finds the package", () => {
    spawnSyncMock.mockReturnValue({ status: 0 });
    expect(jobSpyAdapter.isConfigured()).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    const [, args] = spawnSyncMock.mock.calls[0];
    expect(args.join(" ")).toContain("jobspy");
  });

  it("treats a missing interpreter as unconfigured", () => {
    spawnSyncMock.mockReturnValue({ status: null, error: new Error("spawnSync python ENOENT") });
    expect(jobSpyAdapter.isConfigured()).toBe(false);
  });

  it("caches the probe result across calls (one subprocess per server process)", () => {
    spawnSyncMock.mockReturnValue({ status: 0 });
    jobSpyAdapter.isConfigured();
    jobSpyAdapter.isConfigured();
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it("probes the interpreter JOBSPY_PYTHON names", () => {
    vi.stubEnv("JOBSPY_PYTHON", "C:/custom/python311/python.exe");
    spawnSyncMock.mockReturnValue({ status: 0 });
    jobSpyAdapter.isConfigured();
    expect(spawnSyncMock.mock.calls[0][0]).toBe("C:/custom/python311/python.exe");
  });

  it("falls back to the project .venv-jobspy interpreter when JOBSPY_PYTHON is unset", () => {
    existsSyncMock.mockReturnValue(true);
    spawnSyncMock.mockReturnValue({ status: 0 });
    jobSpyAdapter.isConfigured();
    expect(String(spawnSyncMock.mock.calls[0][0])).toContain(".venv-jobspy");
  });

  it("JOBSPY_PYTHON wins over an existing .venv-jobspy", () => {
    vi.stubEnv("JOBSPY_PYTHON", "C:/custom/python311/python.exe");
    existsSyncMock.mockReturnValue(true);
    spawnSyncMock.mockReturnValue({ status: 0 });
    jobSpyAdapter.isConfigured();
    expect(spawnSyncMock.mock.calls[0][0]).toBe("C:/custom/python311/python.exe");
  });

  it("re-probes a missing dependency after the negative-cache window (background installs get noticed)", () => {
    vi.useFakeTimers();
    spawnSyncMock.mockReturnValue({ status: 1 });
    expect(jobSpyAdapter.isConfigured()).toBe(false);
    expect(jobSpyAdapter.isConfigured()).toBe(false);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6 * 60_000);
    spawnSyncMock.mockReturnValue({ status: 0 });
    expect(jobSpyAdapter.isConfigured()).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);

    // A positive result stays cached for the life of the process.
    vi.advanceTimersByTime(60 * 60_000);
    expect(jobSpyAdapter.isConfigured()).toBe(true);
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
  });

  it("healthCheck surfaces the missing dependency", async () => {
    spawnSyncMock.mockReturnValue({ status: 1 });
    const result = await jobSpyAdapter.healthCheck({} as AdapterContext);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/python-jobspy/);
  });
});

describe("jobspy execution and cooldowns", () => {
  const query = { kind: "keywords" as const, keywords: "engineer", location: null, remoteOnly: false };
  const response = (site: string, status = "ok") => JSON.stringify({
    site, status, details: status === "ok" ? "" : "HTTP 429", retryAfterSeconds: 0,
    items: status === "ok" ? [{ site, title: "Engineer", job_url: "https://example.com/job" }] : [],
  });
  function childProcess() {
    return Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
  }
  function reply(stdout: string, code = 0) {
    const child = childProcess();
    queueMicrotask(() => {
      child.stdout.emit("data", stdout);
      child.emit("close", code);
    });
    return child;
  }
  function search(ctx = createAdapterContext(jobSpyAdapter, "test")) {
    return jobSpyAdapter.search(query, ctx).next();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("JOBSPY_MIN_INTERVAL_SECONDS", "60");
    vi.stubEnv("JOBSPY_FAILURE_COOLDOWN_SECONDS", "1800");
    resetScrapeSchedulerForTests();
    disk.saved = "{}";
    spawnMock.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it.each([
    ["invalid JSON", "{", 0],
    ["invalid envelope", response("different-board"), 0],
    ["helper startup failure", "", 1],
  ])("allows retry after normal spacing for %s", async (_label, stdout, code) => {
    spawnMock.mockImplementationOnce(() => reply(stdout, code));
    await expect(search()).rejects.toThrow();
    // Normal request spacing still applies, but not a 30-minute failure cooldown.
    await expect(search()).rejects.toThrow("Paused until");
    vi.setSystemTime(Date.now() + 61_000);
    resetScrapeSchedulerForTests(); // Read persisted limits as after a restart.
    spawnMock.mockImplementationOnce(() => reply(response("indeed")));
    expect((await search()).value?.items[0].title).toBe("Engineer");
  });

  it.each(["AbortError", "TimeoutError"])("preserves %s without cooling down the board", async (name) => {
    const controller = new AbortController();
    const reason = new DOMException("stopped locally", name);
    const child = childProcess();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    spawnMock.mockImplementationOnce(() => { started(); return child; });
    const context = createAdapterContext(jobSpyAdapter, "abort");
    const pending = search({ ...context, signal: controller.signal });
    const rejection = expect(pending).rejects.toBe(reason);
    await ready;
    controller.abort(reason);
    child.emit("error", Object.assign(new Error("aborted"), { name: "AbortError" }));
    // Aborting must not free the serial queue before the process exits.
    const nextAdapter = jobSpyAdapters[1];
    spawnMock.mockImplementationOnce(() => reply(response("linkedin")));
    const next = nextAdapter.search(query, createAdapterContext(nextAdapter, "next")).next();
    await Promise.resolve();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    child.emit("close", null);
    await rejection;
    expect((await next).value?.items[0].title).toBe("Engineer");
    vi.setSystemTime(Date.now() + 61_000);
    resetScrapeSchedulerForTests();
    spawnMock.mockImplementationOnce(() => reply(response("indeed")));
    expect((await search()).value?.items[0].title).toBe("Engineer");
  });

  it("retains a persisted failure cooldown for an actual board rejection", async () => {
    spawnMock.mockImplementationOnce(() => reply(response("indeed", "rate-limited")));
    await expect(search()).rejects.toThrow("Rate limited");
    vi.setSystemTime(Date.now() + 61_000);
    resetScrapeSchedulerForTests();
    await expect(search()).rejects.toThrow("Rate limited");
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("gives a queued board its full execution budget and then times it out", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), ms);
      return controller.signal;
    });
    try {
      const firstChild = childProcess();
      spawnMock.mockImplementationOnce(() => firstChild);
      const firstContext = createAdapterContext(jobSpyAdapter, "first", 10_000);
      const secondAdapter = jobSpyAdapters[1];
      const secondContext = createAdapterContext(secondAdapter, "second", 1_000);
      const first = search(firstContext);
      const second = secondAdapter.search(query, secondContext).next();
      const rejection = expect(second).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(2_000);
      spawnMock.mockImplementationOnce((_python, _args, { signal }: { signal: AbortSignal }) => {
        const child = childProcess();
        signal.addEventListener("abort", () => {
          child.emit("error", Object.assign(new Error("aborted"), { name: "AbortError" }));
          child.emit("close", null);
        });
        return child;
      });
      firstChild.stdout.emit("data", response("indeed"));
      firstChild.emit("close", 0);
      await first;
      await vi.advanceTimersByTimeAsync(0);
      expect(spawnMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(secondContext.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
    } finally {
      timeout.mockRestore();
    }
  });
});
