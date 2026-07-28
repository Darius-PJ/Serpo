import { describe, it, expect } from "vitest";
import { getCachedListings, setCachedListings } from "@/lib/jobSources/cache";
import type { NormalizedJobListing } from "@/lib/jobSources/types";

const listings: NormalizedJobListing[] = [{ id: "src:1", source: "src", company: "Acme", role: "Engineer", url: "https://example.com" }];

describe("job source cache", () => {
  it("misses when nothing has been cached yet", async () => {
    const result = await getCachedListings("test-source-a", { keywords: "engineer" });
    expect(result).toBeNull();
  });

  it("hits within the TTL after being set", async () => {
    await setCachedListings("test-source-b", { keywords: "engineer" }, listings);
    const result = await getCachedListings("test-source-b", { keywords: "engineer" });
    expect(result).toEqual(listings);
  });

  it("distinguishes different criteria for the same source", async () => {
    await setCachedListings("test-source-c", { keywords: "engineer" }, listings);
    const result = await getCachedListings("test-source-c", { keywords: "designer" });
    expect(result).toBeNull();
  });

  it("misses once the TTL has elapsed", async () => {
    process.env.JOB_CACHE_TTL_MINUTES = "0.0001"; // ~6ms
    try {
      await setCachedListings("test-source-d", { keywords: "engineer" }, listings);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const result = await getCachedListings("test-source-d", { keywords: "engineer" });
      expect(result).toBeNull();
    } finally {
      delete process.env.JOB_CACHE_TTL_MINUTES;
    }
  });
});
