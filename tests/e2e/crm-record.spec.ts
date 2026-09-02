import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("a manual opportunity becomes an editable CRM record with linked contact history", async ({ page }) => {
  await resetWorkspace(page.context().request);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "New application" }).click();
  await page.getByLabel("Company").fill("Northstar Labs");
  await page.getByLabel("Role").fill("Platform Engineer");
  await page.getByLabel("Application notes").fill("Referred by the infrastructure team");
  await page.getByRole("button", { name: "Save application" }).click();

  await expect(page).toHaveURL(/\/applications\//);
  await expect(page.getByLabel("Application notes")).toHaveValue("Referred by the infrastructure team");

  const contactResponse = await page.context().request.post("/api/contacts", {
    headers: { "Content-Type": "application/json" },
    data: { name: "Rina Patel", company: "Northstar Labs", title: "Recruiter" },
  });
  expect(contactResponse.ok()).toBe(true);
  await page.reload();

  await page.getByLabel("Attach existing contact").selectOption({ label: "Rina Patel — Northstar Labs" });
  await page.getByRole("button", { name: "Attach contact" }).click();
  await expect(page.getByText("Rina Patel")).toBeVisible();

  await page.getByLabel("Interaction note").fill("Scheduled recruiter screen");
  await page.getByRole("button", { name: "Log interaction" }).click();
  await expect(page.getByText("Scheduled recruiter screen")).toBeVisible();
});
