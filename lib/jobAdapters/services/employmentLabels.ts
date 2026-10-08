import type { NormalizedJobListing } from "../types";

type EmploymentType = NormalizedJobListing["employment"]["type"];

// Maps a source's own employment-type labels (enum values like Adzuna's "full_time"
// or free text like Lever's commitment and Arbeitnow's "fulltime fixed term") onto the
// schema. Order is precedence: a listing labelled both full-time and contract is
// contract work. Labels matching nothing ("Permanent", "Intern", "") map to null.
const LABEL_PATTERNS: readonly [NonNullable<EmploymentType>, RegExp][] = [
  // "Permanent contract" is the European phrase for a permanent hire, not contract work.
  ["contract", /(?<!permanent\s)\bcontract|\bfreelanc/i],
  ["temporary", /\btemp(orary)?\b|\bfixed[\s-]?term\b|\bbefristet\b/i],
  ["full-time", /\bfull[\s_-]?time\b|\bvollzeit\b/i],
  ["part-time", /\bpart[\s_-]?time\b|\bteilzeit\b/i],
];

export function employmentTypeFromLabels(labels: readonly (string | null | undefined)[]): EmploymentType {
  const present = labels.filter((label): label is string => Boolean(label));
  return LABEL_PATTERNS.find(([, pattern]) => present.some((label) => pattern.test(label)))?.[0] ?? null;
}
