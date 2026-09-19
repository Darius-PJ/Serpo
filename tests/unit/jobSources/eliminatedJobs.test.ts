import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  addEliminatedJob,
  removeEliminatedJob,
  listEliminatedUrls,
  filterOutUrls,
  normalizeListingUrl,
} from "@/lib/jobSources/eliminatedJobs";
import type { JobSearchResult } from "@/lib/jobSources/types";

async function createUser(username: string) {
  return prisma.user.create({ data: { username, passwordHash: "unused" } });
}

const urlA = "https://jobs.example.com/a";
const urlB = "https://jobs.example.com/b";
const urlC = "https://jobs.example.com/c";

describe("per-account eliminated jobs", () => {
  it("returns only the urls this account has eliminated, of the candidates given", async () => {
    const user = await createUser("elim-list-user");
    await addEliminatedJob(user.id, { url: urlA, company: "Acme", role: "Engineer", source: "adzuna" });
    await addEliminatedJob(user.id, { url: urlB });

    const eliminated = await listEliminatedUrls(user.id, [urlA, urlB, urlC]);
    expect(eliminated.has(urlA)).toBe(true);
    expect(eliminated.has(urlB)).toBe(true);
    expect(eliminated.has(urlC)).toBe(false);
    expect(eliminated.size).toBe(2);
  });

  it("stores and matches a long URL verbatim without truncation (regression: url was capped at 200 chars, so long postings never got eliminated)", async () => {
    const user = await createUser("elim-long-url-user");
    const longUrl = `https://www.linkedin.com/jobs/view/1234567890/?${"trk=param&".repeat(30)}end=1`;
    expect(longUrl.length).toBeGreaterThan(200);

    await addEliminatedJob(user.id, { url: longUrl });
    const eliminated = await listEliminatedUrls(user.id, [longUrl, urlA]);
    expect(eliminated.has(longUrl)).toBe(true);
    expect(eliminated.has(urlA)).toBe(false);
  });

  it("is idempotent for the same account and url", async () => {
    const user = await createUser("elim-idempotent-user");
    await addEliminatedJob(user.id, { url: urlA, role: "Engineer" });
    await addEliminatedJob(user.id, { url: urlA, role: "Senior Engineer" });

    const rows = await prisma.eliminatedJob.findMany({ where: { userId: user.id, url: urlA } });
    expect(rows).toHaveLength(1);
  });

  it("removes an elimination and treats removing an absent url as a no-op", async () => {
    const user = await createUser("elim-remove-user");
    await addEliminatedJob(user.id, { url: urlA });

    await removeEliminatedJob(user.id, urlA);
    expect((await listEliminatedUrls(user.id, [urlA])).has(urlA)).toBe(false);

    await expect(removeEliminatedJob(user.id, urlA)).resolves.toBeUndefined();
  });

  it("scopes eliminations per account", async () => {
    const owner = await createUser("elim-owner-user");
    const other = await createUser("elim-other-user");
    await addEliminatedJob(owner.id, { url: urlA });

    expect((await listEliminatedUrls(other.id, [urlA])).has(urlA)).toBe(false);
    expect((await listEliminatedUrls(owner.id, [urlA])).has(urlA)).toBe(true);
  });

  it("throws when eliminating an empty url", async () => {
    const user = await createUser("elim-empty-user");
    await expect(addEliminatedJob(user.id, { url: "   " })).rejects.toThrow();
  });
});

describe("filterOutUrls", () => {
  it("drops listings whose url is excluded while preserving group order and labels", () => {
    const groups: JobSearchResult[] = [
      {
        source: "adzuna",
        label: "Adzuna",
        listings: [
          { id: "adzuna:1", source: "adzuna", company: "Acme", role: "Engineer", url: urlA },
          { id: "adzuna:2", source: "adzuna", company: "Beta", role: "Engineer", url: urlB },
        ],
      },
      {
        source: "remoteok",
        label: "RemoteOK",
        listings: [{ id: "remoteok:1", source: "remoteok", company: "Gamma", role: "Engineer", url: urlC }],
      },
    ];

    const filtered = filterOutUrls(groups, new Set([urlA]));
    expect(filtered.map((g) => g.label)).toEqual(["Adzuna", "RemoteOK"]);
    expect(filtered[0].listings.map((l) => l.url)).toEqual([urlB]);
    expect(filtered[1].listings.map((l) => l.url)).toEqual([urlC]);
  });

  it("returns the input unchanged when nothing is excluded", () => {
    const groups: JobSearchResult[] = [
      { source: "adzuna", label: "Adzuna", listings: [{ id: "adzuna:1", source: "adzuna", company: "Acme", role: "Engineer", url: urlA }] },
    ];
    expect(filterOutUrls(groups, new Set())).toBe(groups);
  });
});

describe("normalizeListingUrl", () => {
  it("preserves a long http(s) URL in full (never truncated to a stored key that can't match)", () => {
    const longUrl = `https://www.indeed.com/viewjob?jk=abc123&${"utm=x&".repeat(50)}last=1`;
    expect(longUrl.length).toBeGreaterThan(200);
    expect(normalizeListingUrl(longUrl)).toBe(longUrl);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeListingUrl("  https://jobs.example.com/a  ")).toBe("https://jobs.example.com/a");
  });

  it("rejects empty, non-string, over-length, non-absolute, and non-http(s) urls", () => {
    expect(normalizeListingUrl("   ")).toBeNull();
    expect(normalizeListingUrl(undefined)).toBeNull();
    expect(normalizeListingUrl(42)).toBeNull();
    expect(normalizeListingUrl(`https://example.com/${"a".repeat(2048)}`)).toBeNull();
    expect(normalizeListingUrl("/jobs/relative")).toBeNull();
    expect(normalizeListingUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeListingUrl("ftp://example.com/x")).toBeNull();
  });
});
