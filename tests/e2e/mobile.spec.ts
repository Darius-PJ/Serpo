import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("the CRM shell does not overflow a phone viewport", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});
