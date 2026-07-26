import { describe, it, expect } from "vitest";
import { isUsOrRemoteListing, isRemoteListing } from "@/lib/jobSources/locationFilter";
import type { NormalizedJobListing } from "@/lib/jobSources/types";

function listing(overrides: Partial<NormalizedJobListing>): NormalizedJobListing {
  return {
    id: "x:1",
    source: "jooble",
    company: "Acme",
    role: "Engineer",
    url: "https://example.com",
    ...overrides,
  };
}

describe("isUsOrRemoteListing", () => {
  it("always passes structurally-US sources regardless of location text", () => {
    expect(isUsOrRemoteListing(listing({ source: "adzuna", location: "Colvin, Onondaga County" }))).toBe(true);
    expect(isUsOrRemoteListing(listing({ source: "usajobs", location: "" }))).toBe(true);
  });

  it("always passes remote-only sources regardless of location text", () => {
    expect(isUsOrRemoteListing(listing({ source: "remotive", location: "Germany" }))).toBe(true);
    expect(isUsOrRemoteListing(listing({ source: "himalayas", location: undefined }))).toBe(true);
  });

  it("passes other sources when the location string has a US or remote hint", () => {
    expect(isUsOrRemoteListing(listing({ source: "jooble", location: "New York, NY" }))).toBe(true);
    expect(isUsOrRemoteListing(listing({ source: "jooble", location: "Austin, Texas" }))).toBe(true);
    expect(isUsOrRemoteListing(listing({ source: "jooble", location: "USA" }))).toBe(true);
    expect(isUsOrRemoteListing(listing({ source: "arbeitnow", location: "Remote" }))).toBe(true);
    expect(isUsOrRemoteListing(listing({ source: "arbeitnow", location: "Worldwide" }))).toBe(true);
  });

  it("rejects other sources with a clearly non-US, non-remote location", () => {
    expect(isUsOrRemoteListing(listing({ source: "arbeitnow", location: "Berlin, Germany" }))).toBe(false);
    expect(isUsOrRemoteListing(listing({ source: "jooble", location: "London, UK" }))).toBe(false);
  });
});

describe("isRemoteListing", () => {
  it("always passes remote-only sources", () => {
    expect(isRemoteListing(listing({ source: "jobicy", location: "USA" }))).toBe(true);
  });

  it("requires a remote keyword for other sources", () => {
    expect(isRemoteListing(listing({ source: "jooble", location: "New York, NY" }))).toBe(false);
    expect(isRemoteListing(listing({ source: "jooble", location: "Remote - US" }))).toBe(true);
  });
});
