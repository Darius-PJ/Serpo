import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isValidPasswordLength } from "@/lib/auth/password";

describe("password hashing", () => {
  it("round-trips correctly", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("salts each hash differently", async () => {
    const h1 = await hashPassword("same-password-123");
    const h2 = await hashPassword("same-password-123");
    expect(h1).not.toBe(h2);
  });
});

describe("isValidPasswordLength", () => {
  it("enforces the 8-128 character bound", () => {
    expect(isValidPasswordLength("short")).toBe(false);
    expect(isValidPasswordLength("a".repeat(129))).toBe(false);
    expect(isValidPasswordLength("a".repeat(8))).toBe(true);
    expect(isValidPasswordLength("a".repeat(128))).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(isValidPasswordLength(42)).toBe(false);
    expect(isValidPasswordLength(undefined)).toBe(false);
  });
});
