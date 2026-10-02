import { describe, it, expect } from "vitest";
import { isContractListing } from "@/lib/jobSources/employmentType";

describe("isContractListing", () => {
  it("keeps listings whose source states contract or temporary work", () => {
    expect(isContractListing({ role: "Network Engineer", employmentType: "contract" })).toBe(true);
    expect(isContractListing({ role: "NOC Technician", employmentType: "temporary" })).toBe(true);
  });

  it("drops listings the source types as permanent work or leaves untyped", () => {
    expect(isContractListing({ role: "Network Engineer", employmentType: "full-time" })).toBe(false);
    expect(isContractListing({ role: "Network Engineer", employmentType: "part-time" })).toBe(false);
    expect(isContractListing({ role: "Network Engineer" })).toBe(false);
  });

  it("keeps untyped listings whose title states contract or temporary employment", () => {
    for (const role of [
      "Contract Network Engineer",
      "Network Engineer (Contract)",
      "Network Engineer - Contract to Hire",
      "Field Technician Contract-to-Hire",
      "Network Administrator C2H",
      "Cisco Engineer - W2/C2C",
      "Network Technician (1099)",
      "Network Engineer Contractor",
      "Temporary NOC Analyst",
      "Temp to Perm Help Desk",
    ]) {
      expect(isContractListing({ role }), role).toBe(true);
    }
  });

  it("does not mistake contract-administration roles for contract employment", () => {
    for (const role of [
      "Contract Specialist",
      "Contract Manager, Network Services",
      "Contracts Administrator",
      "Government Contract Analyst",
      "Template Designer",
    ]) {
      expect(isContractListing({ role }), role).toBe(false);
    }
  });
});
