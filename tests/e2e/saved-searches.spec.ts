import path from "node:path";
import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

// better-sqlite3 has no bundled types; require() avoids adding a
// devDependency just for this test-only seed helper (as in resume.spec.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

const KEYWORDS = "zorbling technician";
const SEARCH_NAME = "Zorbling watch";
// The sources a search reaches with no keys set: playwright.config.ts blanks
// every keyed source, and the test unchecks the JobSpy boards.
const KEYLESS_SOURCES = ["arbeitnow", "remoteok", "remotive", "himalayas", "jobicy"];

// Listings in the adapter record shape (lib/jobAdapters/types.ts) that the
// search pipeline reads back from JobSourceCache. The URLs use an IP literal:
// Track checks a listing URL with a DNS lookup, which Node answers locally
// for an IP, so this test makes no network call at all.
function remotiveListing(jobId: string, title: string, company: string, location: string, description: string) {
  return {
    schemaVersion: 1,
    sourceId: "remotive",
    sourceJobId: jobId,
    idIsDerived: false,
    canonicalUrl: `https://93.184.215.14/jobs/${jobId}`,
    applyUrl: null,
    title,
    company,
    descriptionHtml: null,
    descriptionText: description,
    postedAt: "2026-09-27T12:00:00.000Z",
    fetchedAt: new Date().toISOString(),
    location: { raw: location, remote: true, country: null, region: null, city: null },
    compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
    employment: { type: "full-time", seniorityHint: null },
    provenance: { sourceKind: "aggregator", posterIsLikelyAgency: null, originalSourceUrl: null },
    raw: null,
  };
}

// Descriptions far enough apart that SimHash dedupe keeps both listings.
const REMOTIVE_LISTINGS = [
  remotiveListing(
    "zorb-1001",
    "Zorbling Technician",
    "Quarkwell Labs",
    "Remote",
    "Calibrate the quantum zorbling arrays in our orbital fabrication lab. You will log resonance drift, swap cryogenic couplers during night maintenance windows, and write weekly reports for the hardware reliability group.",
  ),
  remotiveListing(
    "zorb-1002",
    "Zorbling Technician, Field Team",
    "Brimstone Fabrication",
    "Remote (US)",
    "Travel to customer greenhouses across the Midwest to install and repair irrigation zorblers. Expect driving, lifting up to fifty pounds, soldering sensor boards, and training farm crews on seasonal upkeep routines.",
  ),
];

// Fresh cache entries for every keyless source, keyed like
// lib/jobSources/cache.ts hashes the query lib/jobAdapters/search.ts builds
// from what the search form sends, so the search never fetches.
function seedSourceCache() {
  const query = { kind: "keywords", keywords: KEYWORDS, location: "", remoteOnly: false, employmentType: "any" };
  const criteriaHash = createHash("sha256").update(JSON.stringify(query, Object.keys(query).sort())).digest("hex");
  const db = new Database(path.resolve(process.cwd(), "data", "e2e.db"));
  const upsert = db.prepare(
    `INSERT INTO "JobSourceCache" ("id", "source", "criteriaHash", "listingsJson", "fetchedAt")
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT ("source", "criteriaHash") DO UPDATE SET "listingsJson" = excluded."listingsJson", "fetchedAt" = excluded."fetchedAt"`,
  );
  for (const source of KEYLESS_SOURCES) {
    upsert.run(`e2e-${source}-${criteriaHash.slice(0, 12)}`, source, criteriaHash, JSON.stringify(source === "remotive" ? REMOTIVE_LISTINGS : []));
  }
  db.close();
}

test("a saved search's new listings reach the badge and dashboard, then get triaged in its inbox", async ({ page }) => {
  await resetWorkspace(page.context().request);
  seedSourceCache();
  const nav = page.getByRole("navigation", { name: "Primary navigation" });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill(KEYWORDS);
  for (const board of await page.getByRole("group", { name: "Search with JobSpy" }).getByRole("checkbox").all()) {
    await board.uncheck();
  }
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Zorbling Technician", { exact: true })).toBeVisible();
  await expect(page.getByText("Zorbling Technician, Field Team", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save this search" }).click();
  const saveForm = page.getByRole("form", { name: "Save this search" });
  await saveForm.getByLabel("Name").fill(SEARCH_NAME);
  await saveForm.getByLabel("How often").selectOption("daily");
  await saveForm.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved. Find it under Saved searches on Sourcing.")).toBeVisible();

  // The panel appears above the search with exactly the searched criteria: no JobSpy boards.
  const saved = page.getByRole("region", { name: "Saved searches" }).getByRole("listitem").filter({ hasText: SEARCH_NAME });
  await expect(saved).toContainText(`${KEYWORDS} · No JobSpy boards`);
  await saved.getByRole("button", { name: "Run now" }).click();
  await expect(saved.getByRole("status")).toHaveText("Found 2 new listings.");
  await expect(saved.getByText("2 new", { exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sourcing (2 new)" })).toBeVisible();

  await page.goto("/dashboard");
  const detail = `2 new listings for "${SEARCH_NAME}"`;
  const queueItem = page.getByRole("region", { name: "Needs attention" }).getByRole("listitem").filter({ hasText: detail });
  await expect(queueItem.getByText("New listings", { exact: true })).toBeVisible();
  await queueItem.getByRole("link", { name: detail }).click();
  await page.waitForURL(/\/sourcing\?savedSearch=/);

  // The link opens that inbox; both hits arrived since it was last viewed.
  const inbox = page.getByRole("region", { name: "Saved searches" }).getByRole("listitem").filter({ hasText: SEARCH_NAME });
  await expect(inbox.getByRole("button", { name: "Hide listings" })).toBeVisible();
  for (const company of ["Quarkwell Labs", "Brimstone Fabrication"]) {
    await expect(inbox.getByRole("listitem").filter({ hasText: company }).getByText("New", { exact: true })).toBeVisible();
  }
  // Opening it counted as viewing them.
  await expect(nav.getByRole("link", { name: "Sourcing", exact: true })).toBeVisible();
  await expect(inbox.getByText("2 new", { exact: true })).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByText(/new listings? for "Zorbling watch"/)).toHaveCount(0);

  await nav.getByRole("link", { name: "Sourcing", exact: true }).click();
  await page.waitForURL("**/sourcing");
  const revisited = page.getByRole("region", { name: "Saved searches" }).getByRole("listitem").filter({ hasText: SEARCH_NAME });
  await revisited.getByRole("button", { name: "Show listings" }).click();
  const dismissed = revisited.getByRole("listitem").filter({ hasText: "Quarkwell Labs" });
  const tracked = revisited.getByRole("listitem").filter({ hasText: "Brimstone Fabrication" });
  await expect(tracked).toBeVisible();
  await expect(revisited.getByText("New", { exact: true })).toHaveCount(0);

  await dismissed.getByRole("button", { name: "Dismiss" }).click();
  await expect(dismissed).toHaveCount(0);
  await tracked.getByRole("button", { name: "Track" }).click();
  await expect(tracked).toHaveCount(0);
  await expect(revisited.getByText("Nothing waiting here.", { exact: false })).toBeVisible();

  // Both stay out of the inbox, and the tracked one is on the pipeline as Sourced.
  await page.reload();
  const reloaded = page.getByRole("region", { name: "Saved searches" }).getByRole("listitem").filter({ hasText: SEARCH_NAME });
  await reloaded.getByRole("button", { name: "Show listings" }).click();
  await expect(reloaded.getByText("Nothing waiting here.", { exact: false })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Sourced 1" })).toBeVisible();
});
