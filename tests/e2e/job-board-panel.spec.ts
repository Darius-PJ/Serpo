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

test("state jurisdiction group starts collapsed and expands via the chevron", async ({ page }) => {
  await registerViaUi(page, randomUsername("boardpanel"));

  const created = await page.context().request.post("/api/job-boards", {
    headers: { "Content-Type": "application/json" },
    data: { name: "Test State Board", url: "https://example-state-board.gov", jurisdiction: "state" },
  });
  expect(created.ok()).toBe(true);

  await page.goto("/sourcing");

  await expect(page.getByText("Test State Board")).not.toBeVisible();
  await expect(page.getByText(/^state \(1\)$/i)).toBeVisible();

  await page.getByText(/^state \(1\)$/i).click();
  await expect(page.getByText("Test State Board")).toBeVisible();
});

test("adding a non-ATS board to the pool marks it browse-only (not a false live checkmark)", async ({ page, baseURL }) => {
  await registerViaUi(page, randomUsername("boardpool"));

  // The pool route's Greenhouse/Lever verification is a real server-side
  // fetch that Playwright's page.route() can't intercept (it only sees
  // browser-originated requests) — mocking either that or a real 3rd-party
  // API would be unreliable. Pointing this board at the app's own always-up
  // /login page exercises the real, unmocked "browse-only" code path
  // end-to-end instead: detectBoardIntegration correctly finds no known ATS
  // platform, so it falls through to the honest reachability check.
  const created = await page.context().request.post("/api/job-boards", {
    headers: { "Content-Type": "application/json" },
    data: { name: "Self-hosted Test Board", url: `${baseURL}/login`, jurisdiction: "other" },
  });
  expect(created.ok()).toBe(true);

  await page.goto("/sourcing");
  await expect(page.getByText("Self-hosted Test Board")).toBeVisible();

  await page.getByTitle("Add to search pool").click();
  await expect(page.getByTitle("Saved — link verified, but not live-searchable")).toBeVisible();
  await expect(page.getByTitle("Live in your search pool")).not.toBeVisible();
});
