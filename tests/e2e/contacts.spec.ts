import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("contacts are added, merged by name+company, and carry a logged interaction history", async ({ page }) => {
  await resetWorkspace(page.context().request);

  await page.goto("/contacts");
  await expect(page.getByText("No contacts yet.", { exact: false })).toBeVisible();

  // Add a contact manually.
  await page.getByLabel("Contact name").fill("Rina Patel");
  await page.getByLabel("Contact company").fill("Acme");
  await page.getByRole("button", { name: "Add contact" }).click();
  const acmeGroup = page.getByRole("region", { name: "Contacts at Acme" });
  await expect(acmeGroup.getByText("Rina Patel")).toBeVisible();

  // Re-adding the same person (different case, with a title) merges instead
  // of duplicating, and backfills the missing title.
  await page.getByLabel("Contact name").fill("rina patel");
  await page.getByLabel("Contact company").fill("Acme");
  await page.getByLabel("Contact title").fill("Recruiter");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(acmeGroup.getByText("Recruiter")).toBeVisible();
  await expect(acmeGroup.getByRole("listitem").filter({ hasText: "Rina Patel" })).toHaveCount(1);

  // A different company with the same name stays a separate contact.
  await page.getByLabel("Contact name").fill("Rina Patel");
  await page.getByLabel("Contact company").fill("Beta");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("region", { name: "Contacts at Beta" }).getByText("Rina Patel")).toBeVisible();

  // Log an interaction on the Acme contact.
  await acmeGroup.getByLabel("Interaction kind").selectOption("call");
  await acmeGroup.getByLabel("Interaction direction").selectOption("inbound");
  await acmeGroup.getByLabel("Interaction note").fill("Phone screen went well");
  await acmeGroup.getByRole("button", { name: "Log interaction" }).click();
  await expect(acmeGroup.getByText("call (inbound)")).toBeVisible();
  await expect(acmeGroup.getByText("Phone screen went well")).toBeVisible();
});
