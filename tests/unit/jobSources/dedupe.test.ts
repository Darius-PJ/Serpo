import { describe, it, expect } from "vitest";
import { dedupeListings } from "@/lib/jobSources/dedupe";
import { prisma } from "@/lib/db/prisma";
import type { NormalizedJobListing } from "@/lib/jobSources/types";

function listing(overrides: Partial<NormalizedJobListing>): NormalizedJobListing {
  return {
    id: overrides.id ?? "src:1",
    source: overrides.source ?? "src",
    company: overrides.company ?? "Acme",
    role: overrides.role ?? "Engineer",
    url: overrides.url ?? "https://example.com",
    ...overrides,
  };
}

// A real cross-posted duplicate is almost always the same wording verbatim,
// wrapped/truncated differently by each board — see the identical comment
// in simhash.test.ts for why a paraphrase (e.g. contraction changes) is a
// poor stand-in for this.
const CORE_TEXT =
  "We are looking for a Backend Engineer to build and maintain our REST APIs using Node.js and PostgreSQL. You will work closely with the product team to ship new features across our platform, focusing on reliability, performance, and clean API design. We offer a competitive salary, full health benefits, and a flexible remote friendly culture.";
const BACKEND_A = CORE_TEXT;
const BACKEND_B = `<div><p>${CORE_TEXT}</p><p>Apply now through our careers page.</p></div>`;
const DESIGNER =
  "We need a Product Designer to lead our design system work, collaborating with research to craft delightful, accessible user experiences across our mobile and desktop apps.";

describe("dedupeListings", () => {
  it("collapses cross-posted near-duplicate descriptions into one family", async () => {
    const result = await dedupeListings([
      listing({ id: "adzuna:1", source: "adzuna", company: "Acme", role: "Backend Engineer", description: BACKEND_A }),
      listing({ id: "jooble:1", source: "jooble", company: "Acme", role: "Backend Engineer", description: BACKEND_B }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("prefers a direct-employer posting over a staffing-agency repost of the same job", async () => {
    const result = await dedupeListings([
      listing({ id: "agency:1", source: "agency", company: "Robert Half", role: "Backend Engineer", description: BACKEND_A }),
      listing({ id: "direct:1", source: "direct", company: "Acme", role: "Backend Engineer", description: BACKEND_B }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("direct:1");
  });

  it("keeps genuinely distinct postings separate", async () => {
    const result = await dedupeListings([
      listing({ id: "a:1", company: "Acme", role: "Backend Engineer", description: BACKEND_A }),
      listing({ id: "a:2", company: "Widgets Co", role: "Product Designer", description: DESIGNER }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for empty input", async () => {
    expect(await dedupeListings([])).toEqual([]);
  });

  it("reuses an existing family for an unchanged listingId without recomputing", async () => {
    const first = listing({ id: "adzuna:99", role: "Backend Engineer", description: BACKEND_A });
    await dedupeListings([first]);
    const before = await prisma.jobListingFingerprint.findUniqueOrThrow({ where: { listingId: "adzuna:99" } });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await dedupeListings([first]);
    const after = await prisma.jobListingFingerprint.findUniqueOrThrow({ where: { listingId: "adzuna:99" } });

    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("picks up a changed description reusing the same listingId", async () => {
    const original = listing({ id: "adzuna:50", role: "Backend Engineer", description: BACKEND_A });
    await dedupeListings([original]);
    const before = await prisma.jobListingFingerprint.findUniqueOrThrow({ where: { listingId: "adzuna:50" } });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const changed = listing({ id: "adzuna:50", role: "Data Scientist", description: DESIGNER });
    await dedupeListings([changed]);
    const after = await prisma.jobListingFingerprint.findUniqueOrThrow({ where: { listingId: "adzuna:50" } });

    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.contentHash).not.toBe(before.contentHash);
  });
});
