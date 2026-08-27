import { afterEach, describe, expect, it } from "vitest";
import { clearLoginFailures, loginRetryAfterSeconds, recordLoginFailure, resetLoginRateLimitForTests } from "@/lib/security/loginRateLimit";

afterEach(resetLoginRateLimitForTests);

describe("login rate limit", () => {
  it("allows five failures, then limits further attempts within the window", () => {
    const key = "local:person";
    for (let count = 0; count < 5; count++) recordLoginFailure(key, 1_000);
    expect(loginRetryAfterSeconds(key, 1_001)).toBeGreaterThan(0);
  });

  it("clears the limit after a successful sign-in", () => {
    const key = "local:person";
    for (let count = 0; count < 5; count++) recordLoginFailure(key, 1_000);
    clearLoginFailures(key);
    expect(loginRetryAfterSeconds(key, 1_001)).toBeNull();
  });
});
