import { describe, it, expect } from "vitest";
import { matchesExactTitle, isSeniorTitle } from "@/lib/jobSources/titleMatch";

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
});
