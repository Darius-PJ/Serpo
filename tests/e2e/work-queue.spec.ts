import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

test("the work queue unifies tasks, outreach, and contact recency", async ({ page }) => {
  await resetWorkspace(page.context().request);
  const api = page.context().request;
  const applicationResponse = await api.post("/api/applications", {
    headers: { "Content-Type": "application/json" },
    data: { company: "Acme", role: "Engineer", source: "manual" },
  });
  const { application } = await applicationResponse.json();
  await api.post("/api/tasks", {
    headers: { "Content-Type": "application/json" },
    data: { title: "Prepare recruiter questions", applicationId: application.id },
  });
  const contactResponse = await api.post("/api/contacts", {
    headers: { "Content-Type": "application/json" },
    data: { name: "Rina Patel", company: "Acme" },
  });
  const { contact } = await contactResponse.json();
  await api.post(`/api/contacts/${contact.id}/interactions`, {
    headers: { "Content-Type": "application/json" },
    data: { kind: "email", direction: "outbound", notes: "Introduced myself", applicationId: application.id },
  });

  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Work queue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open tasks" })).toBeVisible();
  await expect(page.getByText("Prepare recruiter questions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outreach" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact recency" })).toBeVisible();
  await expect(page.getByText("Rina Patel")).toBeVisible();
  await expect(page.getByText(/Last touch/)).toBeVisible();
});
