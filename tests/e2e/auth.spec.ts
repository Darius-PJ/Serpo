import { test, expect } from "@playwright/test";

test("the local workspace opens without registration or login", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Log out")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
});