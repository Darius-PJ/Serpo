import { describe, it, expect } from "vitest";
import { matchesExactTitle, isSeniorTitle, scoreTitleRelevance } from "@/lib/jobSources/titleMatch";

describe("matchesExactTitle", () => {
  it("matches when the phrase appears verbatim, case-insensitively", () => {
    expect(matchesExactTitle("Senior Backend Engineer", "backend engineer")).toBe(true);
    expect(matchesExactTitle("BACKEND ENGINEER II", "Backend Engineer")).toBe(true);
  });

  it("does not match a different phrasing of a similar role", () => {
    expect(matchesExactTitle("Backend Developer", "backend engineer")).toBe(false);
    expect(matchesExactTitle("Software Engineer, Backend Systems", "backend engineer")).toBe(false);
  });

  it("is tolerant of extra whitespace/punctuation spacing", () => {
    expect(matchesExactTitle("Backend   Engineer", "backend engineer")).toBe(true);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesExactTitle("Anything", "")).toBe(true);
  });
});

describe("isSeniorTitle", () => {
  it("flags titles containing 'senior'", () => {
    expect(isSeniorTitle("Senior Backend Engineer")).toBe(true);
    expect(isSeniorTitle("Backend Engineer, Senior")).toBe(true);
  });

  it("flags the common 'Sr.' abbreviation", () => {
    expect(isSeniorTitle("Sr. Backend Engineer")).toBe(true);
    expect(isSeniorTitle("Sr Backend Engineer")).toBe(true);
  });

  it("does not flag entry/mid-level titles", () => {
    expect(isSeniorTitle("Backend Engineer")).toBe(false);
    expect(isSeniorTitle("Backend Engineer II")).toBe(false);
  });

  it("does not false-positive on substrings like 'seniority'", () => {
    expect(isSeniorTitle("Seniority-blind Hiring Coordinator")).toBe(false);
  });

  it("flags staff/principal/lead/architect individual-contributor senior tracks", () => {
    expect(isSeniorTitle("Staff Software Engineer")).toBe(true);
    expect(isSeniorTitle("Principal Network Engineer")).toBe(true);
    expect(isSeniorTitle("Lead DevOps Engineer")).toBe(true);
    expect(isSeniorTitle("Network Architect")).toBe(true);
  });

  it("flags management-track titles", () => {
    expect(isSeniorTitle("Engineering Manager")).toBe(true);
    expect(isSeniorTitle("Director of IT")).toBe(true);
    expect(isSeniorTitle("Head of Security")).toBe(true);
    expect(isSeniorTitle("Chief Information Officer")).toBe(true);
    expect(isSeniorTitle("VP of Engineering")).toBe(true);
  });

  it("flags III/IV level suffixes but keeps II", () => {
    expect(isSeniorTitle("Network Engineer III")).toBe(true);
    expect(isSeniorTitle("Network Engineer IV")).toBe(true);
    expect(isSeniorTitle("Network Engineer II")).toBe(false);
  });

  it("exempts markers the searcher themself asked for", () => {
    // "Staff Accountant" is a job family, not a seniority level — a user
    // searching for it must not have every result filtered away.
    expect(isSeniorTitle("Staff Accountant", "staff accountant")).toBe(false);
    expect(isSeniorTitle("Staff Accountant")).toBe(true);
    expect(isSeniorTitle("Senior Staff Accountant", "staff accountant")).toBe(true);
    expect(isSeniorTitle("Engineering Manager", "engineering manager")).toBe(false);
  });
});

describe("scoreTitleRelevance", () => {
  it("scores verbatim phrase containment as exact", () => {
    expect(scoreTitleRelevance("Network Engineer II", "network engineer")).toBe("exact");
    expect(scoreTitleRelevance("Cloud Network   Engineer", "network engineer")).toBe("exact");
  });

  it("scores all-tokens-present (any order) as strong", () => {
    expect(scoreTitleRelevance("Network Systems Engineer", "network engineer")).toBe("strong");
    expect(scoreTitleRelevance("Engineer, Network Infrastructure", "network engineer")).toBe("strong");
  });

  it("scores a user-curated alias match as alias", () => {
    expect(scoreTitleRelevance("Infrastructure Analyst (Hybrid)", "network engineer", { userAliases: ["infrastructure analyst"] })).toBe("alias");
  });

  it("scores a role-family alias contained in the title as family", () => {
    expect(scoreTitleRelevance("Network Administrator - Datacenter", "network engineer", { familyAliases: ["network administrator"] })).toBe("family");
  });

  it("scores a short title contained inside a longer family alias as family", () => {
    // Real listings are often terser than O*NET's official phrasing.
    expect(scoreTitleRelevance("Infrastructure Analyst", "network engineer", { familyAliases: ["public key infrastructure analyst"] })).toBe("family");
  });

  it("requires at least two tokens for the reverse containment rule", () => {
    expect(scoreTitleRelevance("Analyst", "network engineer", { familyAliases: ["public key infrastructure analyst"] })).toBe("none");
  });

  it("scores an unrelated title as none", () => {
    expect(scoreTitleRelevance("Registered Nurse", "network engineer", { familyAliases: ["network administrator"] })).toBe("none");
  });

  it("prefers exact over alias and family when several apply", () => {
    expect(
      scoreTitleRelevance("Network Engineer", "network engineer", { userAliases: ["network engineer"], familyAliases: ["network engineer"] })
    ).toBe("exact");
  });

  it("treats an empty query as exact, preserving the legacy contract", () => {
    expect(scoreTitleRelevance("Anything", "")).toBe("exact");
  });
});
