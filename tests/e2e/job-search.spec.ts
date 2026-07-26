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

// Mocks the entire /api/jobs/search response so this test never makes a real
// network call to any external job API or the Claude API — same pattern as
// tests/e2e/confirm-dialogs.spec.ts's mocked apply/decision-maker routes.
test("job search renders a Recommended section, per-source groups, and clickable related-search chips", async ({ page }) => {
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
            listings: [
              {
                id: "remotive:1",
                source: "remotive",
                company: "Acme",
                role: "Backend Engineer",
                location: "Remote",
                url: "https://example.com/job/1",
              },
            ],
          },
        ],
        recommended: [
          {
            id: "remotive:1",
            source: "remotive",
            company: "Acme",
            role: "Backend Engineer",
            location: "Remote",
            url: "https://example.com/job/1",
          },
        ],
        relatedSearchTerms: ["platform engineer", "software engineer backend"],
      },
    });
  });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Keywords"]').fill("backend engineer");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("Recommended for you")).toBeVisible();
  await expect(page.getByText("Remotive")).toBeVisible();
  // "Acme" legitimately appears twice — once in Recommended, once in the
  // per-source Remotive group — since the mock returns the same listing in both.
  await expect(page.getByText("Acme").first()).toBeVisible();
  await expect(page.getByText("Acme")).toHaveCount(2);
  expect(searchCalls).toBe(1);
  expect(lastKeywords).toBe("backend engineer");

  const chip = page.getByRole("button", { name: "platform engineer" });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect.poll(() => searchCalls).toBe(2);
  expect(lastKeywords).toBe("platform engineer");
});
