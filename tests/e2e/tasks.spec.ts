import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("tasks flow from quick-add through the attention queue, pipeline cards, done, and snooze", async ({ page }) => {
  await resetWorkspace(page.context().request);
  const api = page.context().request;

  // A fresh account starts caught up; adding a standalone task changes that.
  await page.goto("/dashboard");
  await expect(page.getByText("Nothing is waiting on you. When a follow-up comes due it appears here first.")).toBeVisible();
  await page.getByLabel("New task title").fill("Update resume");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Update resume")).toBeVisible();
  await expect(page.getByText("Nothing is waiting on you. When a follow-up comes due it appears here first.")).not.toBeVisible();

  // An application-linked task added from the detail page, dated in the past
  // so it is immediately due.
  const created = await api.post("/api/applications", {
    headers: { "Content-Type": "application/json" },
    data: { company: "Acme", role: "Engineer", source: "manual" },
  });
  expect(created.ok()).toBe(true);
  const { application } = await created.json();

  await page.goto(`/applications/${application.id}`);
  await page.getByLabel("New task title").fill("Prep phone screen");
  await page.getByLabel("Due date").fill("2020-01-01");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Prep phone screen")).toBeVisible();

  // The pipeline card shows it as the next action.
  await page.goto("/pipeline");
  await expect(page.getByText("Next: Prep phone screen")).toBeVisible();

  // Both tasks sit in the attention queue; the linked one carries its
  // application, and snoozing it clears it from the queue.
  await page.goto("/dashboard");
  await expect(page.getByText("Prep phone screen")).toBeVisible();
  await expect(page.getByRole("link", { name: "Acme" })).toBeVisible();
  await page.getByRole("button", { name: "Snooze task: Prep phone screen" }).click();
  await expect(page.getByText("Prep phone screen")).not.toBeVisible();

  // A snoozed task also stops being the card's next action.
  await page.goto("/pipeline");
  await expect(page.getByText("Next: Prep phone screen")).not.toBeVisible();

  // Completing the standalone task empties the queue again.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Complete task: Update resume" }).click();
  await expect(page.getByText("Nothing is waiting on you. When a follow-up comes due it appears here first.")).toBeVisible();
});
