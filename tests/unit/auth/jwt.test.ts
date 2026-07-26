import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";

describe("session JWT", () => {
  it("round-trips a userId", async () => {
    const token = await signSessionToken("user-123");
    const result = await verifySessionToken(token);
    expect(result?.userId).toBe("user-123");
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken("user-123");
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    const result = await verifySessionToken(tampered);
    expect(result).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});
