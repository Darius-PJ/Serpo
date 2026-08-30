/** Lowercase, trim, and collapse whitespace so punctuation/casing differences don't block a match. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Stricter normalization for relevance scoring: punctuation becomes word breaks.
 * Shared by roleFamilies and titleAliases so stored/derived aliases and scored
 * titles always agree on word boundaries. */
export function normalizeTitleLoose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const normalizeLoose = normalizeTitleLoose;

/** Whole-word phrase containment — "internetwork engineer" must not contain "network engineer". */
function containsPhrase(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * "Exact match" here means the searched phrase appears verbatim (case-insensitive)
 * inside the title — not that the whole title equals the query. A search for
 * "backend engineer" matches "Senior Backend Engineer" or "Backend Engineer II",
 * but not "Backend Developer" or "Software Engineer, Backend Systems".
 */
export function matchesExactTitle(title: string, keywords: string): boolean {
  const normalizedKeywords = normalize(keywords);
  if (!normalizedKeywords) return true;
  return normalize(title).includes(normalizedKeywords);
}

export type TitleRelevance = "exact" | "strong" | "alias" | "family" | "none";

export interface TitleRelevanceOptions {
  /** O*NET role-family aliases for the searched keyword (lib/jobSources/roleFamilies). */
  familyAliases?: readonly string[];
  /** The user's own curated aliases for this keyword — they outrank family matches. */
  userAliases?: readonly string[];
}

function matchesAliasList(titleLoose: string, aliases: readonly string[]): boolean {
  const titleTokenCount = titleLoose.split(" ").length;
  return aliases.some((raw) => {
    const alias = normalizeLoose(raw);
    if (!alias) return false;
    if (containsPhrase(titleLoose, alias)) return true;
    // Reverse containment: real listings are often terser than O*NET's official
    // phrasing ("Infrastructure Analyst" ⊂ "Public Key Infrastructure Analyst").
    // Two-token minimum so a bare "Analyst" doesn't match half the taxonomy.
    return titleTokenCount >= 2 && containsPhrase(alias, titleLoose);
  });
}

/**
 * Tiered relevance replacing the old boolean exact gate:
 *   exact  — searched phrase appears verbatim in the title (legacy rule)
 *   strong — every query token appears in the title, any order
 *   alias  — matches one of the user's curated aliases for this keyword
 *   family — matches an O*NET role-family alias (same responsibilities, different words)
 *   none   — drop it
 */
export function scoreTitleRelevance(title: string, keywords: string, options: TitleRelevanceOptions = {}): TitleRelevance {
  const query = normalizeLoose(keywords);
  if (!query) return "exact"; // legacy contract: empty query matches everything
  const titleLoose = normalizeLoose(title);

  if (containsPhrase(titleLoose, query)) return "exact";

  const titleTokens = new Set(titleLoose.split(" "));
  if (query.split(" ").every((token) => titleTokens.has(token))) return "strong";

  if (options.userAliases && matchesAliasList(titleLoose, options.userAliases)) return "alias";
  if (options.familyAliases && matchesAliasList(titleLoose, options.familyAliases)) return "family";
  return "none";
}

// Markers checked as whole words/phrases against the loosely-normalized title.
// "ii" is deliberately absent — II is mid-level, per product requirement.
const SENIOR_MARKERS = [
  "senior",
  "sr",
  "staff",
  "principal",
  "lead",
  "architect",
  "manager",
  "mgr",
  "director",
  "head of",
  "chief",
  "vp",
  "vice president",
  "iii",
  "iv",
];

/**
 * Excludes senior-level titles so results skew entry/mid-level, per product
 * requirement. A marker that appears in the user's own query is exempt: someone
 * searching "staff accountant" (a job family, not a level) or "engineering
 * manager" has opted into that word — only the *other* markers still filter.
 */
export function isSeniorTitle(title: string, keywords?: string): boolean {
  const titleLoose = normalizeLoose(title);
  const query = keywords ? normalizeLoose(keywords) : "";
  return SENIOR_MARKERS.some((marker) => containsPhrase(titleLoose, marker) && !(query && containsPhrase(query, marker)));
}
