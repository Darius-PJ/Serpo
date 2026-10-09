import path from "node:path";
import { createHash } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { resetWorkspace } from "./helpers";

// better-sqlite3 has no bundled types; require() avoids adding a
// devDependency just for this test-only seed helper (as in saved-searches.spec.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

const KEYWORDS = "night nurse";
// The sources a search reaches with no keys set and no JobSpy boards selected.
const KEYLESS_SOURCES = ["arbeitnow", "remoteok", "himalayas", "jobicy"];

// lib/jobSources/cache.ts's key: sha256 of the query with sorted keys.
function criteriaHash(query: object) {
  return createHash("sha256").update(JSON.stringify(query, Object.keys(query).sort())).digest("hex");
}

// Fresh source-cache rows, so neither the search nor Follow's verification of
// Zocdoc's Greenhouse board leaves this machine. The listing URL is an IP literal
// for the same reason as in saved-searches.spec.ts.
function seedSourceCache() {
  const db = new Database(path.resolve(process.cwd(), "data", "e2e.db"));
  const upsert = db.prepare(
    `INSERT INTO "JobSourceCache" ("id", "source", "criteriaHash", "listingsJson", "fetchedAt")
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT ("source", "criteriaHash") DO UPDATE SET "listingsJson" = excluded."listingsJson", "fetchedAt" = excluded."fetchedAt"`,
  );
  const keywordHash = criteriaHash({ kind: "keywords", keywords: KEYWORDS, location: "", remoteOnly: false, employmentType: "any" });
  for (const source of KEYLESS_SOURCES) upsert.run(`e2e-companies-${source}`, source, keywordHash, "[]");
  const zocdocListing = {
    schemaVersion: 1,
    sourceId: "greenhouse:zocdoc",
    sourceJobId: "zoc-1",
    idIsDerived: false,
    canonicalUrl: "https://93.184.215.14/zocdoc/jobs/zoc-1",
    applyUrl: null,
    title: "Night Nurse",
    company: "zocdoc",
    descriptionHtml: null,
    descriptionText: "Answer patient calls overnight and route urgent cases to on-call physicians.",
    postedAt: "2026-10-01T12:00:00.000Z",
    fetchedAt: new Date().toISOString(),
    location: { raw: "Remote (US)", remote: true, country: null, region: null, city: null },
    compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
    employment: { type: "full-time", seniorityHint: null },
    provenance: { sourceKind: "ats", posterIsLikelyAgency: false, originalSourceUrl: null },
    raw: null,
  };
  upsert.run("e2e-companies-zocdoc", "greenhouse", criteriaHash({ kind: "target", target: "zocdoc" }), JSON.stringify([zocdocListing]));
  db.close();
}

// The request the search form sends, with every JobSpy board unchecked.
async function search(request: APIRequestContext) {
  const response = await request.post("/api/jobs/search", {
    headers: { "Content-Type": "application/json" },
    data: { keywords: KEYWORDS, location: "", remoteOnly: false, employmentType: "any", jobSpySites: [] },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { results: { source: string; listings: { company: string; role: string }[] }[] };
}

test("suggestions come from searches and picked fields, and only Follow adds a company to search", async ({ page }) => {
  await resetWorkspace(page.context().request);
  seedSourceCache();
  await search(page.context().request);

  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Companies", exact: true }).click();
  await page.waitForURL("**/companies");
  await expect(page.getByRole("heading", { name: "Companies", level: 1 })).toBeVisible();

  const history = page.getByRole("region", { name: "Your recent searches" });
  const following = page.getByRole("region", { name: "Following" });
  const suggestions = page.getByRole("region", { name: /Suggested companies/ });
  await expect(history.getByText(KEYWORDS)).toBeVisible();

  // The search suggests healthcare employers, and nothing is followed yet.
  const zocdoc = suggestions.getByRole("listitem").filter({ hasText: "Zocdoc" });
  await expect(zocdoc.getByText("Related to your search “night nurse”")).toBeVisible();
  await expect(following.getByText("You aren't following any companies yet.")).toBeVisible();

  await zocdoc.getByRole("button", { name: "Follow Zocdoc" }).click();
  const followedZocdoc = following.getByRole("listitem").filter({ hasText: "Zocdoc" });
  await expect(followedZocdoc.getByText("Included in every search")).toBeVisible();
  await expect(zocdoc).toHaveCount(0);

  // A followed company is searched, under its own name rather than its board token.
  const { results } = await search(page.context().request);
  const zocdocGroup = results.find((group) => group.source === "greenhouse:zocdoc");
  expect(zocdocGroup?.listings).toEqual([expect.objectContaining({ company: "Zocdoc", role: "Night Nurse" })]);

  // Not interested hides a suggestion until it is brought back.
  const oneMedical = suggestions.getByRole("listitem").filter({ hasText: "One Medical" });
  await oneMedical.getByRole("button", { name: "Not interested in One Medical" }).click();
  await expect(oneMedical).toHaveCount(0);
  await suggestions.getByRole("button", { name: "Show 1 hidden company again" }).click();
  await expect(oneMedical).toHaveCount(1);

  // A picked field is remembered and suggests its companies.
  const education = page.getByRole("button", { name: "Education" });
  await education.click();
  await expect(education).toHaveAttribute("aria-pressed", "true");
  await expect(suggestions.getByRole("listitem").filter({ hasText: "Coursera" }).getByText("You picked Education")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Education" })).toHaveAttribute("aria-pressed", "true");

  // Clearing the history removes the suggestions it produced.
  await history.getByRole("button", { name: "Clear search history" }).click();
  await expect(history.getByText("Searches you run on Sourcing or the dashboard appear here.")).toBeVisible();
  await expect(oneMedical).toHaveCount(0);

  await followedZocdoc.getByRole("button", { name: "Unfollow Zocdoc" }).click();
  await expect(following.getByText("You aren't following any companies yet.")).toBeVisible();
});
