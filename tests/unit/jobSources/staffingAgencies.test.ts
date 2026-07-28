import { describe, it, expect } from "vitest";
import { isStaffingAgency } from "@/lib/jobSources/staffingAgencies";

describe("isStaffingAgency", () => {
  it("recognizes known staffing/recruiting agencies", () => {
    expect(isStaffingAgency("Robert Half")).toBe(true);
    expect(isStaffingAgency("Insight Global")).toBe(true);
    expect(isStaffingAgency("TEKsystems")).toBe(true);
  });

  it("is case-insensitive and matches as a substring of a longer name", () => {
    expect(isStaffingAgency("robert half international")).toBe(true);
    expect(isStaffingAgency("ROBERT HALF")).toBe(true);
  });

  it("matches generic staffing-suffix patterns", () => {
    expect(isStaffingAgency("Acme Staffing Solutions")).toBe(true);
    expect(isStaffingAgency("Beacon Workforce Solutions")).toBe(true);
  });

  it("does not flag ordinary direct employers, including ones with generic-sounding names", () => {
    expect(isStaffingAgency("Acme Corp")).toBe(false);
    expect(isStaffingAgency("Widgets Co")).toBe(false);
    expect(isStaffingAgency("Acme Solutions")).toBe(false);
    expect(isStaffingAgency("Acme Consulting")).toBe(false);
  });

  it("handles empty input", () => {
    expect(isStaffingAgency("")).toBe(false);
  });
});
