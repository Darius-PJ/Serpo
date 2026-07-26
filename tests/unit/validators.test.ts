import { describe, it, expect } from "vitest";
import { isValidDomain, isValidUsername, normalizeUsername } from "@/lib/validators";

describe("isValidDomain", () => {
  it("accepts plausible domains", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("sub.example.co.uk")).toBe(true);
  });

  it("rejects a bare word with no TLD", () => {
    expect(isValidDomain("example")).toBe(false);
  });

  it("rejects a leading-hyphen label", () => {
    expect(isValidDomain("-example.com")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidDomain(123)).toBe(false);
    expect(isValidDomain(undefined)).toBe(false);
  });
});

describe("isValidUsername / normalizeUsername", () => {
  it("accepts simple usernames", () => {
    expect(isValidUsername("darius_jones")).toBe(true);
    expect(isValidUsername("d.jones-2")).toBe(true);
  });

  it("rejects too-short usernames", () => {
    expect(isValidUsername("ab")).toBe(false);
  });

  it("rejects leading/trailing separators", () => {
    expect(isValidUsername("_darius")).toBe(false);
    expect(isValidUsername("darius_")).toBe(false);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeUsername("  Darius  ")).toBe("darius");
  });
});
