import type { DecisionMakerResult, OsintConnector, OsintQuery } from "./types";

// Hunter.io Domain Search: named people with positions and per-email confidence
// scores for a company domain. Replaced theHarvester (2026-09-02), whose free
// source modules have decayed to the point of returning nothing for typical
// employer domains. Free tier: ~25 searches/month.
interface HunterEmail {
  value?: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  confidence?: number | null;
}

interface HunterDomainSearchResponse {
  data?: { emails?: HunterEmail[] };
}

export const hunterConnector: OsintConnector = {
  key: "hunter",
  label: "Hunter.io",

  isConfigured() {
    return Boolean(process.env.HUNTER_API_KEY);
  },

  async research(query: OsintQuery): Promise<DecisionMakerResult[]> {
    if (!query.domain && !query.company) throw new Error("Hunter.io needs a domain or company name to search.");
    const url = new URL("https://api.hunter.io/v2/domain-search");
    // Hunter resolves a bare company name itself, so automation can search on
    // the user-entered name without ever fabricating a domain.
    if (query.domain) url.searchParams.set("domain", query.domain);
    else url.searchParams.set("company", query.company!);
    url.searchParams.set("limit", "25");

    // The key travels in a header, never the URL, so it can't leak into
    // request logs or referrers.
    const response = await fetch(url, {
      headers: { "X-API-KEY": process.env.HUNTER_API_KEY ?? "" },
    });
    if (!response.ok) {
      throw new Error(`Hunter.io domain search failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as HunterDomainSearchResponse;
    return (payload.data?.emails ?? [])
      .filter((entry) => entry.value)
      .map((entry) => {
        const name = [entry.first_name, entry.last_name].filter(Boolean).join(" ");
        const result: DecisionMakerResult = { email: entry.value, sourceTool: "hunter" };
        if (name) result.name = name;
        if (entry.position) result.title = entry.position;
        if (entry.confidence !== null && entry.confidence !== undefined) {
          result.confidence = `hunter-confidence-${entry.confidence}`;
        }
        return result;
      });
  },
};
