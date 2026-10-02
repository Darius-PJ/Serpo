import type { NormalizedJobListing } from "./types";

// A contract search keeps contract and temporary work. A listing qualifies when its
// source states that employment type, or when the title itself says so — the only
// signal sources without a job-type field carry. Listings with neither are dropped.
const CONTRACT_TITLE_PATTERNS = [
  /\bcontract[\s-]*to[\s-]*hire\b/i,
  /\bc2[hc]\b/i,
  /\b1099\b/i,
  /\bcontractor\b/i,
  /\btemp(orary)?\b/i,
  // "Contract" as the employment term ("Contract Network Engineer", "Engineer (Contract)"),
  // not as the subject of the work ("Contract Specialist", "Contract Manager").
  /\bcontract\b(?![\s-]*(?:specialist|manager|management|administrator|administration|admin|analyst|negotiator|officer|coordinator|attorney|counsel|lawyer|compliance|review|reviewer|pricing|closeout|associate|paralegal|clerk|accountant|director|writer)\b)/i,
];

export function isContractListing(listing: Pick<NormalizedJobListing, "role" | "employmentType">): boolean {
  if (listing.employmentType === "contract" || listing.employmentType === "temporary") return true;
  return CONTRACT_TITLE_PATTERNS.some((pattern) => pattern.test(listing.role));
}
