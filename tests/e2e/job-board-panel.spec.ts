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

test("pool verification is honest: private-host boards are rejected and unverifiable boards never show live", async ({ page, baseURL }) => {
  await registerViaUi(page, randomUsername("boardpool"));

  // The SSRF guard rejects http/loopback URLs at creation, so the old
  // browse-only fixture (pointing a board at the app's own /login) is
  // impossible by design. The browse-only decision is unit-tested with
  // injected deps in tests/unit/jobBoards/poolVerification.test.ts; here we
  // pin the guard itself plus the honest failure path end-to-end.
  const loopback = await page.context().request.post("/api/job-boards", {
    headers: { "Content-Type": "application/json" },
    data: { name: "Loopback Board", url: `${baseURL}/login`, jurisdiction: "other" },
  });
  expect(loopback.status()).toBe(400);

  // A well-formed URL on the reserved .invalid TLD (RFC 2606) can never
  // resolve, so the real, unmocked pool verification must land on the honest
  // "failed" state — never a false live checkmark.
  const created = await page.context().request.post("/api/job-boards", {
    headers: { "Content-Type": "application/json" },
    data: { name: "Unresolvable Board", url: "https://pool-test-board.invalid", jurisdiction: "other" },
  });
  expect(created.ok()).toBe(true);

  await page.goto("/sourcing");
  const row = page.locator("li", { hasText: "Unresolvable Board" });
  await expect(row).toBeVisible();

  await row.getByTitle("Add to search pool").click();
  await expect(row.getByTitle("Verification failed — click to retry")).toBeVisible();
  await expect(row.getByTitle("Live in your search pool")).not.toBeVisible();
  await expect(row.getByTitle("Saved — link verified, but not live-searchable")).not.toBeVisible();
});
