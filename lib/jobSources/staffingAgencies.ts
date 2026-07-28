// Heuristic staffing/recruiting-agency detection, used only to pick a
// representative when lib/jobSources/dedupe.ts collapses a cluster of
// cross-posted duplicates — prefer a direct-employer posting over an agency
// repost of the same job when the cluster has both. Deliberately a plain
// keyword list rather than an AI classification call: this whole feature
// exists to cut API costs, so adding a Claude call per listing would defeat
// the purpose.

// Well-known staffing/recruiting agencies. Matched as a whole word/phrase
// against the company name, case-insensitively.
const KNOWN_AGENCY_NAMES = [
  "robert half",
  "insight global",
  "randstad",
  "aerotek",
  "teksystems",
  "kforce",
  "adecco",
  "manpowergroup",
  "manpower",
  "apex systems",
  "actalent",
  "modis",
  "collabera",
  "vaco",
  "beacon hill",
  "cybercoders",
  "motion recruitment",
  "jobot",
  "signature consultants",
  "diversant",
  "apidel",
  "epitec",
  "genesis10",
  "yoh",
  "volt",
  "cdi corp",
  "hays",
  "spherion",
  "artech",
  "mastech",
  "ettain group",
];

// Generic suffix patterns — deliberately specific (not bare "solutions" or
// "consulting", which would false-positive on plenty of direct employers).
const AGENCY_SUFFIX_PATTERNS = [/\bstaffing\b/i, /\bstaffing solutions\b/i, /\bworkforce solutions\b/i, /\btalent solutions\b/i, /\brecruiting (llc|inc)\b/i];

function normalize(company: string): string {
  return company.toLowerCase().trim();
}

export function isStaffingAgency(company: string): boolean {
  const normalized = normalize(company);
  if (!normalized) return false;
  if (KNOWN_AGENCY_NAMES.some((name) => normalized.includes(name))) return true;
  return AGENCY_SUFFIX_PATTERNS.some((pattern) => pattern.test(normalized));
}
