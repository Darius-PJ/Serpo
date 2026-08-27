import { describe, expect, it } from "vitest";
import { isNonPublicIpAddress, parseExternalHttpsUrl } from "@/lib/security/externalUrl";

describe("external URL validation", () => {
  it("accepts a credential-free public HTTPS URL", () => {
    expect(parseExternalHttpsUrl("https://jobs.example.com/openings?role=engineer").toString()).toBe(
      "https://jobs.example.com/openings?role=engineer"
    );
  });

  it.each([
    "http://example.com",
    "file:///etc/passwd",
    "https://user:password@example.com",
    "https://localhost/jobs",
    "https://127.0.0.1/jobs",
    "https://[::1]/jobs",
  ])("rejects unsafe URL %s", (value) => {
    expect(() => parseExternalHttpsUrl(value)).toThrow();
  });

  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "::1", "fc00::1", "fe80::1"])(
    "identifies %s as non-public",
    (address) => {
      expect(isNonPublicIpAddress(address)).toBe(true);
    }
  );

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("does not classify public address %s as non-public", (address) => {
    expect(isNonPublicIpAddress(address)).toBe(false);
  });
});
