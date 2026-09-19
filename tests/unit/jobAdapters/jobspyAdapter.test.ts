import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterContext } from "@/lib/jobAdapters/types";

// The probe runs before any search, synchronously, so spawnSync is the seam.
// spawn (async, used by search()) is left real via importOriginal.
const spawnSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: spawnSyncMock };
});

// existsSync is the seam for the .venv-jobspy interpreter fallback.
const existsSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: existsSyncMock };
});

import { jobSpyAdapters, resetJobSpyProbeForTests } from "@/lib/jobAdapters/adapters/jobspy";
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
