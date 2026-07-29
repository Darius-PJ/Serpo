import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCacheHandle } from "@/lib/jobAdapters/services/cache";

const getCachedListings = vi.fn();
const setCachedListings = vi.fn();
vi.mock("@/lib/jobSources/cache", () => ({
  getCachedListings: (...args: unknown[]) => getCachedListings(...args),
  setCachedListings: (...args: unknown[]) => setCachedListings(...args),
}));

beforeEach(() => {
  getCachedListings.mockReset();
  setCachedListings.mockReset();
});

describe("adapter cache handle", () => {
  it("delegates to the shared JobSourceCache table/TTL logic when storage is allowed", async () => {
    getCachedListings.mockResolvedValueOnce(null);
    const handle = createCacheHandle("fixture-keyword", { cacheable: true, tosForbidsStorage: false });

    await handle.get({ keywords: "engineer" });
    expect(getCachedListings).toHaveBeenCalledWith("fixture-keyword", { keywords: "engineer" });

    await handle.set({ keywords: "engineer" }, []);
    expect(setCachedListings).toHaveBeenCalledWith("fixture-keyword", { keywords: "engineer" }, []);
  });

  it("never reads or writes when cacheable is false", async () => {
    const handle = createCacheHandle("fixture-keyword", { cacheable: false, tosForbidsStorage: false });
    expect(await handle.get({ keywords: "engineer" })).toBeNull();
    await handle.set({ keywords: "engineer" }, []);
    expect(getCachedListings).not.toHaveBeenCalled();
    expect(setCachedListings).not.toHaveBeenCalled();
  });

  it("tosForbidsStorage overrides cacheable: true unconditionally", async () => {
    const handle = createCacheHandle("fixture-keyword", { cacheable: true, tosForbidsStorage: true });
    expect(await handle.get({ keywords: "engineer" })).toBeNull();
    await handle.set({ keywords: "engineer" }, []);
    expect(getCachedListings).not.toHaveBeenCalled();
    expect(setCachedListings).not.toHaveBeenCalled();
  });
});
