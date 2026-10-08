import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

const EMPTY_QUEUE = "Nothing is waiting on you. When a follow-up comes due it appears here first.";

test("a fresh dashboard leads with the search and grows metrics once something is tracked", async ({ page }) => {
  await resetWorkspace(page.context().request);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // First run: one thing to do, and it is the search. Nothing to count yet.
  await expect(page.getByRole("heading", { name: "Start with a search" })).toBeVisible();
  await expect(page.getByText(EMPTY_QUEUE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add manual application" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pipeline metrics" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recent activity" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sourced 0" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open board" })).toBeVisible();

  const created = await page.context().request.post("/api/applications", {
    headers: { "Content-Type": "application/json" },
    data: { company: "Acme", role: "Engineer", source: "manual" },
  });
  expect(created.ok()).toBe(true);

  // With one application tracked the search stays, renamed, and the numbers appear.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Find the next one" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pipeline metrics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sourced 1" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "manual" })).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.waitForURL("**/pipeline");
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sourced (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acme" })).toBeVisible();
  await expect(page.getByLabel("Status for Acme — Engineer")).toBeVisible();
});
