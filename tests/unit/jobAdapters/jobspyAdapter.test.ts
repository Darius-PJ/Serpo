import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterContext } from "@/lib/jobAdapters/types";

// The probe runs before any search, synchronously, so spawnSync is the seam.
// spawn (async, used by search()) is left real via importOriginal.
const spawnSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: spawnSyncMock };
});

import { jobSpyAdapter, resetJobSpyProbeForTests } from "@/lib/jobAdapters/adapters/jobspy";

describe("jobspy adapter dependency probe", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    vi.unstubAllEnvs();
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

  it("healthCheck surfaces the missing dependency", async () => {
    spawnSyncMock.mockReturnValue({ status: 1 });
    const result = await jobSpyAdapter.healthCheck({} as AdapterContext);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/python-jobspy/);
  });
});
