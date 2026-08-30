import { test, expect } from "@playwright/test";
import { registerViaApi } from "./helpers";

test("dashboard is a CRM home and the column board lives at /pipeline", async ({ page }) => {
  await registerViaApi(page.context().request);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("All caught up — nothing needs your attention.")).toBeVisible();
  await expect(page.getByText("No activity yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sourced 0" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open board →" })).toBeVisible();

  const created = await page.context().request.post("/api/applications", {
    headers: { "Content-Type": "application/json" },
    data: { company: "Acme", role: "Engineer", source: "manual" },
  });
  expect(created.ok()).toBe(true);

  await page.reload();
  await expect(page.getByRole("link", { name: "Sourced 1" })).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.waitForURL("**/pipeline");
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sourced (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acme" })).toBeVisible();
  await expect(page.getByLabel("Status for Acme — Engineer")).toBeVisible();
});
