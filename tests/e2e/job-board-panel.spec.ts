import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

async function prepareWorkspace(page: import("@playwright/test").Page) {
  await resetWorkspace(page.context().request);
}

test("state jurisdiction group starts collapsed and expands via the chevron", async ({ page }) => {
  await prepareWorkspace(page);

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
  await prepareWorkspace(page);

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

test("a failed board mutation preserves input and explains the failure", async ({ page }) => {
  await prepareWorkspace(page);
  await page.route("**/api/job-boards", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Storage unavailable" }) });
      return;
    }
    await route.continue();
  });
  await page.goto("/sourcing");
  await page.getByRole("button", { name: "Add a board" }).click();
  await page.getByPlaceholder("Name").fill("Local Tech Board");
  await page.getByPlaceholder("https://…").fill("https://jobs.example.com");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Storage unavailable" })).toBeVisible();
  await expect(page.getByPlaceholder("Name")).toHaveValue("Local Tech Board");
  await expect(page.getByPlaceholder("https://…")).toHaveValue("https://jobs.example.com");
});
