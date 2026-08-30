import { test, expect } from "@playwright/test";
import { registerViaApi } from "./helpers";

test("board filters cards, and both the dropdown and keyboard drag move cards while writing the audit trail", async ({ page }) => {
  await registerViaApi(page.context().request);
  const api = page.context().request;
  for (const data of [
    { company: "Acme", role: "Engineer", source: "manual" },
    { company: "Beta", role: "Analyst", source: "usajobs" },
  ]) {
    const created = await api.post("/api/applications", {
      headers: { "Content-Type": "application/json" },
      data,
    });
    expect(created.ok()).toBe(true);
  }

  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { name: "Sourced (2)" })).toBeVisible();

  // Keyword filter narrows by company/role.
  await page.getByLabel("Filter by company or role").fill("acme");
  await expect(page.getByRole("heading", { name: "Sourced (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Beta" })).not.toBeVisible();
  await page.getByLabel("Filter by company or role").fill("");
  await expect(page.getByRole("heading", { name: "Sourced (2)" })).toBeVisible();

  // Source filter narrows by adapter/source.
  await page.getByLabel("Filter by source").selectOption("usajobs");
  await expect(page.getByRole("link", { name: "Acme" })).not.toBeVisible();
  await expect(page.getByRole("link", { name: "Beta" })).toBeVisible();
  await page.getByLabel("Filter by source").selectOption("all");

  // The dropdown stays the accessible path and moves the card between columns.
  await page.getByLabel("Status for Acme — Engineer").selectOption("Submitted");
  await expect(page.getByRole("heading", { name: "Submitted (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sourced (1)" })).toBeVisible();

  // Keyboard drag: pick up Beta's card, arrow into the next column, drop.
  // dnd-kit's live-region announcements gate each step so a keypress never
  // outruns the sensor's measurements. ("Picked up …" is replaced within
  // milliseconds by the initial over-announcement, so gate on the latter.)
  await page.getByRole("button", { name: "Move Beta — Analyst" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("was moved over droppable area Sourced");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("was moved over droppable area Submitted");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("was dropped over droppable area Submitted");
  await expect(page.getByRole("heading", { name: "Submitted (2)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sourced (0)" })).toBeVisible();

  // Both moves recorded status_changed events — the dashboard feed shows them.
  await page.goto("/dashboard");
  await expect(page.getByText("Status changed: Sourced → Submitted").first()).toBeVisible();
});
