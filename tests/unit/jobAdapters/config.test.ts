import { describe, expect, it, vi } from "vitest";
import { validateAdapterConfig, isAdapterConfigured, logConfigWarnings } from "@/lib/jobAdapters/config";
import { keywordAdapter, unconfiguredAdapter } from "@/lib/jobAdapters/testing/fixtureAdapters";

describe("validateAdapterConfig / isAdapterConfigured", () => {
  it("reports configured when configSchema is empty", () => {
    expect(validateAdapterConfig(keywordAdapter)).toEqual({ configured: true, missing: [] });
    expect(isAdapterConfigured(keywordAdapter)).toBe(true);
  });

  it("reports unconfigured, listing the missing env var, when a required field is absent", () => {
    delete process.env.FIXTURE_UNCONFIGURED_API_KEY;
    expect(validateAdapterConfig(unconfiguredAdapter)).toEqual({ configured: false, missing: ["FIXTURE_UNCONFIGURED_API_KEY"] });
    expect(isAdapterConfigured(unconfiguredAdapter)).toBe(false);
  });

  it("never throws, even when required env vars are absent", () => {
    delete process.env.FIXTURE_UNCONFIGURED_API_KEY;
    expect(() => validateAdapterConfig(unconfiguredAdapter)).not.toThrow();
    expect(() => isAdapterConfigured(unconfiguredAdapter)).not.toThrow();
  });
});

describe("logConfigWarnings", () => {
  it("warns once per unconfigured adapter and never for a configured one", () => {
    delete process.env.FIXTURE_UNCONFIGURED_API_KEY;
    const warn = vi.fn();
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };

    logConfigWarnings([keywordAdapter, unconfiguredAdapter], logger);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "adapter unconfigured, excluded from search",
      expect.objectContaining({ sourceId: "fixture-unconfigured", missingEnvVars: ["FIXTURE_UNCONFIGURED_API_KEY"] })
    );
  });
});
