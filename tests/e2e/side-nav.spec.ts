import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("Sourcing sits directly after Dashboard in the primary navigation", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.goto("/dashboard");

  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  const names = await nav
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("aria-label") ?? link.textContent?.trim() ?? ""));
  expect(names.slice(0, 2)).toEqual(["Dashboard", "Sourcing"]);
});

test("the sidebar collapses to an icon rail and the choice survives reload", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.goto("/dashboard");

  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  const expandedWidth = (await nav.boundingBox())!.width;

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
  // The rail animates its width, so poll until the transition settles.
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(expandedWidth - 80);
  const collapsedWidth = (await nav.boundingBox())!.width;

  await page.reload();
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThanOrEqual(collapsedWidth + 1);
});
