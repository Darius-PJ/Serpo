import { test, expect } from "@playwright/test";

test("pages open directly in the local workspace", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("the local API is available without a session cookie", async ({ request }) => {
  const res = await request.get("/api/applications");
  expect(res.status()).toBe(200);
  await expect(res.json()).resolves.toHaveProperty("applications");
});