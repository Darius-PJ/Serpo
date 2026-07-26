/** Lowercase, trim, and collapse whitespace so punctuation/casing differences don't block a match. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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

/** Excludes senior-level titles so results skew entry/mid-level, per product requirement. */
export function isSeniorTitle(title: string): boolean {
  return /\bsenior\b|\bsr\.?\b/i.test(title);
}
