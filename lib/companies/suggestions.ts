import { COMPANY_CATALOG, companyKey, type CatalogCompany } from "./catalog";
import { industriesForSearch, INDUSTRY_LABELS, type IndustryId } from "./industries";

export interface CompanySuggestion {
  company: CatalogCompany;
  /** Why it is suggested, strongest first, in words shown beside the company. */
  reasons: string[];
}

// Words people wrap around a company name when they search for one: "spotify jobs", "jobs at domino's".
const FILLER_WORDS = /\b(jobs?|careers?|hiring|at|openings?)\b/g;

/**
 * Ranks catalog companies for one account. A company qualifies when a past
 * search was for it by name, when a past search points at one of its
 * industries, or when it is in an industry the account picked. Followed and
 * hidden companies never appear. Suggesting is all this does — following is a
 * separate, explicit action.
 *
 * Name matching is deliberately exact (the whole search, minus filler words):
 * matching inside phrases would turn "outreach coordinator" into the Outreach
 * software company and "toast" into a restaurant-software suggestion.
 */
export function suggestCompanies({
  industries,
  searches,
  excludedKeys,
}: {
  industries: readonly IndustryId[];
  /** Newest first. */
  searches: readonly { keywords: string }[];
  excludedKeys: ReadonlySet<string>;
}): CompanySuggestion[] {
  const searchSignals = searches.map((search) => ({
    keywords: search.keywords,
    bareName: search.keywords.toLowerCase().replace(/['’]/g, "").replace(FILLER_WORDS, " ").replace(/\s+/g, " ").trim(),
    industries: industriesForSearch(search.keywords),
  }));

  const ranked: (CompanySuggestion & { score: number })[] = [];
  for (const company of COMPANY_CATALOG) {
    if (excludedKeys.has(companyKey(company.platform, company.token))) continue;
    const names = [company.name.toLowerCase().replace(/['’]/g, ""), company.token.toLowerCase()];
    const reasons: string[] = [];
    let score = 0;

    const named = searchSignals.find((search) => names.includes(search.bareName));
    if (named) {
      score += 4;
      reasons.push(`You searched for “${named.keywords}”`);
    }
    const related = searchSignals.find(
      (search) => search !== named && search.industries.some((id) => company.industries.includes(id)),
    );
    if (related) {
      score += 2;
      reasons.push(`Related to your search “${related.keywords}”`);
    }
    const picked = company.industries.find((id) => industries.includes(id));
    if (picked) {
      score += 1;
      reasons.push(`You picked ${INDUSTRY_LABELS[picked]}`);
    }
    if (score > 0) ranked.push({ company, reasons, score });
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
    .map(({ company, reasons }) => ({ company, reasons }));
}
