import { test, expect } from "@playwright/test";
import { randomUsername, E2E_PASSWORD } from "./helpers";

async function registerViaUi(page: import("@playwright/test").Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="new-password"]').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard");
}

function listing(n: number) {
  return {
    id: `remotive:${n}`,
    source: "remotive",
    company: "Acme",
    role: `Backend Engineer ${n}`,
    location: "Remote",
    url: `https://example.com/job/${n}`,
  };
}

// Mocks the entire /api/jobs/search response so this test never makes a real
// network call to any external job API or the Claude API — same pattern as
// tests/e2e/confirm-dialogs.spec.ts's mocked apply/decision-maker routes.
test("job search renders a per-source cloud cell and clickable suggested-title chips", async ({ page }) => {
  await registerViaUi(page, randomUsername("jobsearch"));

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
            source: "remotive",
            label: "Remotive",
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

  await expect(page.getByText("Remotive")).toBeVisible();
  await expect(page.getByText("Backend Engineer 1")).toBeVisible();
  expect(searchCalls).toBe(1);
  expect(lastKeywords).toBe("backend engineer");

  const chip = page.getByRole("button", { name: "platform engineer" });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect.poll(() => searchCalls).toBe(2);
  expect(lastKeywords).toBe("platform engineer");
});

test("results-per-page selector and pagination controls work", async ({ page }) => {
  await registerViaUi(page, randomUsername("jobsearchpg"));

  const listings = Array.from({ length: 12 }, (_, i) => listing(i + 1));
  await page.route("**/api/jobs/search", async (route) => {
    await route.fulfill({
      json: {
        results: [{ source: "remotive", label: "Remotive", listings }],
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
