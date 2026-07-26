import { test, expect } from "@playwright/test";
import { randomUsername, E2E_PASSWORD } from "./helpers";

test("register, log out, and log back in through the UI", async ({ page }) => {
  const username = randomUsername("auth");

  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="new-password"]').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Log out")).toBeVisible();

  await page.getByText("Log out").click();
  await page.waitForURL("**/login");

  // Log back in.
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Log out")).toBeVisible();
});

test("wrong password shows an error and does not log in", async ({ page }) => {
  const username = randomUsername("authbad");

  // Create the account first.
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="new-password"]').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard");
  await page.getByText("Log out").click();
  await page.waitForURL("**/login");

  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill("definitely-the-wrong-password");
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText("invalid username or password")).toBeVisible();
  expect(page.url()).toContain("/login");
});
