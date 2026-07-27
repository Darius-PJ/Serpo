import { describe, it, expect } from "vitest";
import { isMeldSource, MELD_SOURCE_LABELS } from "@/lib/resume/meldSource";

describe("isMeldSource", () => {
  it("accepts the three valid meld sources", () => {
    expect(isMeldSource("reference")).toBe(true);
    expect(isMeldSource("improved")).toBe(true);
    expect(isMeldSource("benchmark")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMeldSource("melded")).toBe(false);
    expect(isMeldSource("")).toBe(false);
    expect(isMeldSource(null)).toBe(false);
    expect(isMeldSource(undefined)).toBe(false);
    expect(isMeldSource(42)).toBe(false);
  });
});

describe("MELD_SOURCE_LABELS", () => {
  it("has a human-readable label for every meld source", () => {
    expect(MELD_SOURCE_LABELS.reference).toBeTruthy();
    expect(MELD_SOURCE_LABELS.improved).toBeTruthy();
    expect(MELD_SOURCE_LABELS.benchmark).toBeTruthy();
  });
});
