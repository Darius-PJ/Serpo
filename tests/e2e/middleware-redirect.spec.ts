import { test, expect } from "@playwright/test";

test("unauthenticated page request redirects to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated API request gets a 401 JSON response, not the page", async ({ request }) => {
  const res = await request.get("/api/applications");
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});
