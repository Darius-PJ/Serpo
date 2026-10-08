import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

async function prepareWorkspace(page: import("@playwright/test").Page) {
  await resetWorkspace(page.context().request);
}

function listing(n: number) {
  return {
    id: `remoteok:${n}`,
    source: "remoteok",
    company: "Acme",
    role: `Backend Engineer ${n}`,
    location: "Remote",
    url: `https://example.com/job/${n}`,
  };
}

test("JobSpy boards have independent sections, errors, and request selection", async ({ page }) => {
  await prepareWorkspace(page);
  let selected: string[] = [];
  await page.route("**/api/jobs/search", async (route) => {
    selected = route.request().postDataJSON().jobSpySites;
    await route.fulfill({ json: { results: [
      { source: "jobspy:indeed", label: "Indeed", listings: [listing(1)] },
      { source: "jobspy:linkedin", label: "LinkedIn", listings: [] },
      { source: "jobspy:zip_recruiter", label: "ZipRecruiter", listings: [], error: "Access denied (403). Requests are paused." },
      { source: "jobspy:glassdoor", label: "Glassdoor", listings: [], error: "Location lookup failed (400)." },
      { source: "jobspy:google", label: "Google Jobs", listings: [], error: "Rate limited (429). Requests are paused.", errorDetails: "www.google.com/sorry/index" },
    ] } });
  });
  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill("backend engineer");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  for (const label of ["Indeed", "LinkedIn", "ZipRecruiter", "Glassdoor", "Google Jobs"]) {
    await expect(page.getByRole("heading", { name: new RegExp(label) })).toBeVisible();
  }
  await expect(page.getByText("Backend Engineer 1")).toBeVisible();
  await expect(page.getByText("www.google.com/sorry/index")).not.toBeVisible();
  await page.getByText("Error details", { exact: true }).click();
  await expect(page.getByText("www.google.com/sorry/index")).toBeVisible();
  await page.getByRole("checkbox", { name: "Google Jobs", exact: true }).uncheck();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect.poll(() => selected).not.toContain("google");
  expect(selected).toEqual(["indeed", "linkedin", "zip_recruiter", "glassdoor"]);
  await expect(page).toHaveURL((url) => url.searchParams.get("jobSpySites") === "indeed,linkedin,zip_recruiter,glassdoor");
  await page.screenshot({ path: "test-results/jobspy-sections.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Google Jobs", exact: true })).not.toBeChecked();
});

// Mocks the entire /api/jobs/search response so this test never makes a real
// network call to any external job API or the Claude API — same pattern as
// tests/e2e/confirm-dialogs.spec.ts's mocked apply/decision-maker routes.
test("job search renders a per-source cloud cell and clickable suggested-title chips", async ({ page }) => {
  await prepareWorkspace(page);

  let searchCalls = 0;
  let lastKeywords: string | undefined;
  await page.route("**/api/jobs/search", async (route) => {
    searchCalls++;
    const body = route.request().postDataJSON() as { keywords?: string };
    lastKeywords = body.keywords;
    await route.fulfill({
      json: {
        results: [
          {
            source: "remoteok",
            label: "RemoteOK",
            listings: [listing(1), listing(2), listing(3)],
          },
        ],
        suggestedTitles: ["platform engineer", "software engineer backend"],
      },
    });
  });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill("backend engineer");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("RemoteOK")).toBeVisible();
  await expect(page.getByText("Backend Engineer 1")).toBeVisible();
  expect(searchCalls).toBe(1);
  expect(lastKeywords).toBe("backend engineer");

  const chip = page.getByRole("button", { name: "platform engineer" });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect.poll(() => searchCalls).toBe(2);
  expect(lastKeywords).toBe("platform engineer");
});

test("eliminating a job hides it from results and can be undone in-session", async ({ page }) => {
  await prepareWorkspace(page);

  await page.route("**/api/jobs/search", async (route) => {
    await route.fulfill({
      json: {
        results: [{ source: "remoteok", label: "RemoteOK", listings: [listing(1), listing(2)] }],
        suggestedTitles: [],
      },
    });
  });

  let eliminatePosts = 0;
  let eliminateDeletes = 0;
  await page.route("**/api/jobs/eliminate", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      eliminatePosts++;
      await route.fulfill({ status: 201, json: { ok: true } });
      return;
    }
    eliminateDeletes++;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill("backend engineer");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  const firstCard = page.locator("li", { hasText: "Backend Engineer 1" });
  await expect(firstCard.getByRole("button", { name: "Eliminate" })).toBeVisible();
  await firstCard.getByRole("button", { name: "Eliminate" }).click();

  await expect.poll(() => eliminatePosts).toBe(1);
  const eliminatedRow = page.locator("li", { hasText: "Backend Engineer 1" });
  await expect(eliminatedRow.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(eliminatedRow.getByRole("button", { name: "Eliminate" })).toHaveCount(0);
  // The other listing keeps its normal card and Eliminate control.
  await expect(page.locator("li", { hasText: "Backend Engineer 2" }).getByRole("button", { name: "Eliminate" })).toBeVisible();

  await eliminatedRow.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => eliminateDeletes).toBe(1);
  const restoredCard = page.locator("li", { hasText: "Backend Engineer 1" });
  await expect(restoredCard.getByRole("button", { name: "Track" })).toBeVisible();
  await expect(restoredCard.getByRole("button", { name: "Eliminate" })).toBeVisible();
});

test("results-per-page selector and pagination controls work", async ({ page }) => {
  await prepareWorkspace(page);

  const listings = Array.from({ length: 12 }, (_, i) => listing(i + 1));
  await page.route("**/api/jobs/search", async (route) => {
    await route.fulfill({
      json: {
        results: [{ source: "remoteok", label: "RemoteOK", listings }],
        suggestedTitles: [],
      },
    });
  });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill("backend engineer");
  // Default page size is 10 — 12 listings should paginate into 2 pages.
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("Backend Engineer 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Backend Engineer 10", { exact: true })).toBeVisible();
  await expect(page.getByText("Backend Engineer 11", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Backend Engineer 11", { exact: true })).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
});

test("family-tier matches collapse under related titles and can be promoted to an alias", async ({ page }) => {
  await prepareWorkspace(page);

  let searchCalls = 0;
  await page.route("**/api/jobs/search", async (route) => {
    searchCalls++;
    await route.fulfill({
      json: {
        results: [
          {
            source: "remoteok",
            label: "RemoteOK",
            listings: [
              { ...listing(1), relevance: "exact" },
              { ...listing(2), role: "Network Administrator", relevance: "family" },
            ],
          },
        ],
        suggestedTitles: [],
        titleAliases: [],
      },
    });
  });

  let aliasPost: { keyword?: string; alias?: string } | undefined;
  await page.route("**/api/title-aliases", async (route) => {
    aliasPost = route.request().postDataJSON() as { keyword?: string; alias?: string };
    await route.fulfill({ json: { alias: { id: "alias-1", alias: "network administrator" } } });
  });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill("network engineer");
  await page.getByRole("button", { name: "Search" }).click();

  // The family match stays out of the primary list until expanded.
  await expect(page.getByText("Backend Engineer 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Network Administrator", { exact: true })).not.toBeVisible();

  await page.getByText("1 related title").click();
  await expect(page.getByText("Network Administrator", { exact: true })).toBeVisible();

  // Promoting it to an alias posts the pair and re-runs the search.
  await page.getByRole("button", { name: "Add alias" }).click();
  await expect.poll(() => searchCalls).toBe(2);
  expect(aliasPost).toEqual({ keyword: "network engineer", alias: "Network Administrator" });
});
