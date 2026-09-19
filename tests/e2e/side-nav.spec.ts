import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("Quit is accessible in the collapsed rail and requests shutdown", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.addInitScript(() => { window.close = () => {}; });
  let calls = 0;
  await page.route("**/api/app/quit", async (route) => { calls++; await route.fulfill({ json: { stopping: true } }); });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await page.getByRole("button", { name: "Quit Serpo" }).click();
  await expect(page.getByRole("status")).toContainText("Closing Serpo");
  expect(calls).toBe(1);
});

test("a refused Quit keeps the app open and explains how to relaunch", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.route("**/api/app/quit", async (route) => route.fulfill({ status: 409, json: { error: "Open Serpo using the updated shortcut." } }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Quit Serpo" }).click();
  await expect(page.getByRole("complementary").getByRole("alert")).toContainText("updated shortcut");
  await expect(page.getByRole("button", { name: "Quit Serpo" })).toBeEnabled();
});

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
