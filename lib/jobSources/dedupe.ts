import type { NormalizedJobListing } from "./types";

/** Lowercase, trim, and strip punctuation/extra whitespace so trivially different strings still match. */
function normalize(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Collapses obvious cross-posted duplicates — the same company+role (and
 * location, when both listings have one) reported by more than one source —
 * keeping the first-seen listing per group. Pure and deterministic: no
 * network calls, no AI, safe to run on every search.
 */
export function dedupeListings(listings: NormalizedJobListing[]): NormalizedJobListing[] {
  const seen = new Map<string, NormalizedJobListing>();

  for (const listing of listings) {
    const location = normalize(listing.location);
    // Only fold location into the key when this listing actually has one —
    // two listings that agree on company+role but disagree on location are
    // genuinely different postings, but a missing location shouldn't be
    // treated as equal to (or different from) any specific one, so it's left
    // out of the key rather than guessed at. Favors keeping a possible
    // duplicate over hiding a real distinct listing.
    const key = [normalize(listing.company), normalize(listing.role), location || undefined].filter(Boolean).join("|");
    if (!seen.has(key)) {
      seen.set(key, listing);
    }
  }

  return [...seen.values()];
}
