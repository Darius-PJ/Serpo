import { describe, expect, it } from "vitest";
import { COMPANY_CATALOG, companyBoardUrl, companyKey } from "@/lib/companies/catalog";
import { industriesForSearch } from "@/lib/companies/industries";
import { suggestCompanies, type CompanySuggestion } from "@/lib/companies/suggestions";
import { findAdapterById } from "@/lib/jobAdapters/registry";

describe("company catalog", () => {
  it("every board URL is recognized by its own platform's adapter as exactly that company", () => {
    for (const company of COMPANY_CATALOG) {
      const adapter = findAdapterById(company.platform);
      expect(adapter?.capabilities.queryModel, company.name).toBe("enumerate-target");
      expect(adapter?.detectTarget?.(companyBoardUrl(company.platform, company.token)), company.name).toBe(company.token);
    }
  });

  it("lists each company board once", () => {
    const keys = COMPANY_CATALOG.map((company) => companyKey(company.platform, company.token));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("industriesForSearch", () => {
  it("matches whole words and phrases only", () => {
    expect(industriesForSearch("ER night nurse")).toEqual(["healthcare"]);
    expect(industriesForSearch("IT support")).toEqual(["technology"]);
    expect(industriesForSearch("e-commerce associate")).toEqual(["retail"]);
    // "hr" inside "three", "it" inside "kitchen" — neither counts.
    expect(industriesForSearch("three month contract")).toEqual([]);
    expect(industriesForSearch("kitchen")).toEqual(["hospitality"]);
  });
});

const NONE = new Set<string>();
const names = (suggestions: CompanySuggestion[]) => suggestions.map((suggestion) => suggestion.company.name);

describe("suggestCompanies", () => {
  it("suggests nothing until the account picks a field or has searched", () => {
    expect(suggestCompanies({ industries: [], searches: [], excludedKeys: NONE })).toEqual([]);
  });

  it("a search for a company by name puts that company first", () => {
    const suggestions = suggestCompanies({ industries: ["media"], searches: [{ keywords: "jobs at spotify" }], excludedKeys: NONE });
    expect(suggestions[0]).toEqual({
      company: expect.objectContaining({ name: "Spotify" }),
      reasons: ["You searched for “jobs at spotify”", "You picked Media & entertainment"],
    });
  });

  it("matches a name ignoring apostrophes and case", () => {
    const [first] = suggestCompanies({ industries: [], searches: [{ keywords: "Dominos careers" }], excludedKeys: NONE });
    expect(first.company.name).toBe("Domino's");
  });

  it("does not treat a company's name inside a longer phrase as a search for it", () => {
    const suggestions = suggestCompanies({ industries: [], searches: [{ keywords: "outreach coordinator" }], excludedKeys: NONE });
    expect(names(suggestions)).not.toContain("Outreach");
  });

  it("a past search suggests companies in the industries it points at, citing the newest such search", () => {
    const suggestions = suggestCompanies({
      industries: [],
      searches: [{ keywords: "weekend work" }, { keywords: "night nurse" }, { keywords: "rn" }],
      excludedKeys: NONE,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.company.industries).toContain("healthcare");
      expect(suggestion.reasons).toEqual(["Related to your search “night nurse”"]);
    }
  });

  it("ranks a company matching both a search and a picked field above one matching only the field", () => {
    const suggestions = suggestCompanies({ industries: ["finance", "fitness"], searches: [{ keywords: "personal trainer" }], excludedKeys: NONE });
    const fitnessCount = COMPANY_CATALOG.filter((company) => company.industries.includes("fitness")).length;
    const top = suggestions.slice(0, fitnessCount);
    expect(top.every((suggestion) => suggestion.company.industries.includes("fitness"))).toBe(true);
    expect(names(suggestions)).toContain("Chime");
  });

  it("never suggests a followed or hidden company, whatever the token's case", () => {
    const suggestions = suggestCompanies({
      industries: ["fitness"],
      searches: [{ keywords: "equinox" }],
      excludedKeys: new Set([companyKey("smartrecruiters", "EQUINOX"), companyKey("greenhouse", "peloton")]),
    });
    expect(names(suggestions)).not.toContain("Equinox");
    expect(names(suggestions)).not.toContain("Peloton");
    expect(names(suggestions)).toContain("ClassPass");
  });
});
