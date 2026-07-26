import { describe, it, expect } from "vitest";
import { dedupeListings } from "@/lib/jobSources/dedupe";
import type { NormalizedJobListing } from "@/lib/jobSources/types";

function listing(overrides: Partial<NormalizedJobListing>): NormalizedJobListing {
  return {
    id: overrides.id ?? "src:1",
    source: overrides.source ?? "src",
    company: overrides.company ?? "Acme",
    role: overrides.role ?? "Engineer",
    url: overrides.url ?? "https://example.com",
    ...overrides,
  };
}

describe("dedupeListings", () => {
  it("collapses the same company+role+location cross-posted by two sources", () => {
    const result = dedupeListings([
      listing({ id: "adzuna:1", source: "adzuna", company: "Acme", role: "Engineer", location: "Remote" }),
      listing({ id: "jooble:1", source: "jooble", company: "Acme", role: "Engineer", location: "Remote" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("adzuna:1");
  });

  it("is case/punctuation/whitespace insensitive", () => {
    const result = dedupeListings([
      listing({ id: "a:1", company: "Acme, Inc.", role: "Backend Engineer", location: "New York, NY" }),
      listing({ id: "b:1", company: "acme inc", role: "backend   engineer", location: "new york ny" }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("keeps listings at the same company+role but different locations", () => {
    const result = dedupeListings([
      listing({ id: "a:1", company: "Acme", role: "Engineer", location: "New York" }),
      listing({ id: "a:2", company: "Acme", role: "Engineer", location: "San Francisco" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("does not merge a listing with a location into one missing a location", () => {
    const result = dedupeListings([
      listing({ id: "a:1", company: "Acme", role: "Engineer", location: "Remote" }),
      listing({ id: "a:2", company: "Acme", role: "Engineer", location: undefined }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("keeps genuinely distinct listings", () => {
    const result = dedupeListings([
      listing({ id: "a:1", company: "Acme", role: "Engineer" }),
      listing({ id: "a:2", company: "Widgets Co", role: "Designer" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeListings([])).toEqual([]);
  });
});
