import { describe, expect, it } from "vitest";
import { listAdapters, listConfiguredAdapters, findAdapterById, listEnumerateTargetAdapters } from "@/lib/jobAdapters/registry";

// The registry is intentionally empty until Phase 4 migrates the first real source
// (docs/architecture-audit.md) — these tests only cover the empty-state contract;
// Phase 4 adds real per-adapter registry integration tests once ADAPTERS is populated.
describe("job adapter registry", () => {
  it("starts empty", () => {
    expect(listAdapters()).toEqual([]);
    expect(listConfiguredAdapters()).toEqual([]);
    expect(listEnumerateTargetAdapters()).toEqual([]);
  });

  it("findAdapterById returns undefined for an unknown id", () => {
    expect(findAdapterById("nonexistent")).toBeUndefined();
  });
});
