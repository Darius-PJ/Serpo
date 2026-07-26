import { describe, it, expect } from "vitest";
import { isApplicationStatus, APPLICATION_STATUSES } from "@/lib/applicationStatus";

describe("isApplicationStatus", () => {
  it("accepts every defined status", () => {
    for (const s of APPLICATION_STATUSES) expect(isApplicationStatus(s)).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isApplicationStatus("Bogus")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isApplicationStatus(42)).toBe(false);
    expect(isApplicationStatus(null)).toBe(false);
    expect(isApplicationStatus(undefined)).toBe(false);
  });
});
