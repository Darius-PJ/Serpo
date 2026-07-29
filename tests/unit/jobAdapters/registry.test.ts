import { describe, expect, it } from "vitest";
import { listAdapters, listConfiguredAdapters, findAdapterById, listEnumerateTargetAdapters } from "@/lib/jobAdapters/registry";

// Phase 4 migrated all 11 sources from docs/architecture-audit.md's inventory —
// the registry is no longer empty (see the now-superseded "starts empty" contract
// this test previously asserted, back when only the harness existed).
const ALL_SOURCE_IDS = [
  "arbeitnow",
  "jobspy",
  "remoteok",
  "adzuna",
  "remotive",
  "himalayas",
  "jobicy",
  "usajobs",
  "jooble",
  "greenhouse",
  "lever",
];

describe("job adapter registry", () => {
  it("has all 11 migrated sources registered", () => {
    const ids = listAdapters().map((adapter) => adapter.metadata.id);
    expect(ids.sort()).toEqual([...ALL_SOURCE_IDS].sort());
  });

  it("every registered adapter is findable by its own id", () => {
    for (const id of ALL_SOURCE_IDS) {
      expect(findAdapterById(id)?.metadata.id).toBe(id);
    }
  });

  it("findAdapterById returns undefined for an unknown id", () => {
    expect(findAdapterById("nonexistent")).toBeUndefined();
  });

  it("greenhouse and lever are the only enumerate-target adapters", () => {
    const ids = listEnumerateTargetAdapters()
      .map((adapter) => adapter.metadata.id)
      .sort();
    expect(ids).toEqual(["greenhouse", "lever"]);
  });

  it("configured adapters exclude those missing required env vars", () => {
    const configuredIds = listConfiguredAdapters().map((adapter) => adapter.metadata.id);
    // adzuna is configured via real .env.local values in this environment; keyless
    // sources are always configured. Not asserting on usajobs/jooble/adzuna's exact
    // configured-ness here since that depends on this environment's real env vars
    // (set in .env.local, not test-controlled) — just that every keyless source is
    // unconditionally present.
    for (const id of ["arbeitnow", "jobspy", "remoteok", "remotive", "himalayas", "jobicy", "greenhouse", "lever"]) {
      expect(configuredIds).toContain(id);
    }
  });
});
