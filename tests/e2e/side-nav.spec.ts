import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("Quit blanks the mounted workspace before shutdown replies and keeps it blank after acceptance", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.addInitScript(() => { window.close = () => console.info("quit-close-requested"); });
  let calls = 0;
  let reply!: () => void;
  const pendingReply = new Promise<void>((resolve) => { reply = resolve; });
  await page.route("**/api/app/quit", async (route) => {
    calls++;
    await pendingReply;
    await route.fulfill({ json: { stopping: true } });
  });
  await page.goto("/dashboard");
  const keywords = page.getByPlaceholder("Job title (e.g. backend engineer)");
  await keywords.fill("engineer");
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await page.getByRole("button", { name: "Quit Serpo" }).click();
  const closeRequested = page.waitForEvent("console", { predicate: (message) => message.text() === "quit-close-requested" });
  try {
    await expect.poll(() => calls).toBe(1);
    await expect(page.locator(".serpo-sidebar")).toBeHidden();
    await expect(page.locator(".serpo-topbar")).toBeHidden();
    await expect(page.getByText("Local workspace")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Dashboard", includeHidden: true })).toBeHidden();
    await expect(page.locator("main")).toBeHidden();
    await expect(page.locator('a[href="#main-content"]')).toBeHidden();
    await expect(keywords).toBeHidden();
    await expect(keywords).toHaveValue("engineer");
  } finally {
    reply();
  }
  await closeRequested;
  await expect(page.locator(".serpo-sidebar")).toBeHidden();
  await expect(page.locator(".serpo-topbar")).toBeHidden();
  await expect(page.locator("main")).toBeHidden();
  await expect(page.getByText("Local workspace")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Dashboard", includeHidden: true })).toBeHidden();
  await expect(keywords).toBeHidden();
});

test("a refused Quit restores the workspace, its inputs, and an enabled Quit action", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.route("**/api/app/quit", async (route) => route.fulfill({ status: 409, json: { error: "Open Serpo using the updated shortcut." } }));
  await page.goto("/dashboard");
  const keywords = page.getByPlaceholder("Job title (e.g. backend engineer)");
  await keywords.fill("engineer");
  await page.getByRole("button", { name: "Quit Serpo" }).click();
  await expect(page.getByRole("complementary").getByRole("alert")).toContainText("updated shortcut");
  await expect(page.getByRole("button", { name: "Quit Serpo" })).toBeEnabled();
  await expect(page.locator(".serpo-topbar")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await expect(keywords).toBeVisible();
  await expect(keywords).toHaveValue("engineer");
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
