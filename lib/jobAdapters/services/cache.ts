// Reuses the existing, already-shipped JobSourceCache table/TTL logic
// (lib/jobSources/cache.ts) rather than duplicating it — that module was genericized
// (Phase 3) specifically so this new record shape (lib/jobAdapters/types.ts) can share
// the same storage without the legacy path's own type changing at all.
import { getCachedListings, setCachedListings } from "@/lib/jobSources/cache";
import type { AdapterCapabilities, CacheHandle, NormalizedJobListing } from "../types";

export function createCacheHandle(sourceId: string, capabilities: Pick<AdapterCapabilities, "cacheable" | "tosForbidsStorage">): CacheHandle {
  // tosForbidsStorage always overrides cacheable — docs/adapter-interface.md 2d, outlier #10.
  const storageAllowed = capabilities.cacheable && !capabilities.tosForbidsStorage;

  return {
    async get(criteria) {
      if (!storageAllowed) return null;
      return getCachedListings<NormalizedJobListing>(sourceId, criteria);
    },
    async set(criteria, listings) {
      if (!storageAllowed) return;
      await setCachedListings<NormalizedJobListing>(sourceId, criteria, listings);
    },
  };
}
