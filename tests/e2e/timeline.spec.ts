import { test, expect } from "@playwright/test";
import { registerViaApi } from "./helpers";

test("the application page shows one merged timeline: tracked, status change, interaction, completed task", async ({ page }) => {
  await registerViaApi(page.context().request);
  const api = page.context().request;
  const headers = { "Content-Type": "application/json" };

  const created = await api.post("/api/applications", {
    headers,
    data: { company: "Acme", role: "Engineer", source: "manual" },
  });
  expect(created.ok()).toBe(true);
  const { application } = await created.json();

  // Status move → status_changed audit event.
  const moved = await api.patch(`/api/applications/${application.id}`, { headers, data: { status: "Submitted" } });
  expect(moved.ok()).toBe(true);

  // Contact + application-linked interaction.
  const contactRes = await api.post("/api/contacts", { headers, data: { name: "Rina Patel", company: "Acme" } });
  expect(contactRes.ok()).toBe(true);
  const { contact } = await contactRes.json();
  const interactionRes = await api.post(`/api/contacts/${contact.id}/interactions`, {
    headers,
    data: { kind: "call", direction: "inbound", notes: "Phone screen scheduled", applicationId: application.id },
  });
  expect(interactionRes.ok()).toBe(true);

  // Completed task.
  const taskRes = await api.post("/api/tasks", {
    headers,
    data: { title: "Prep phone screen", applicationId: application.id },
  });
  expect(taskRes.ok()).toBe(true);
  const { task } = await taskRes.json();
  const doneRes = await api.patch(`/api/tasks/${task.id}`, { headers, data: { completed: true } });
  expect(doneRes.ok()).toBe(true);

  await page.goto(`/applications/${application.id}`);
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByText("Application tracked")).toBeVisible();
  await expect(timeline.getByText("Status changed: Sourced → Submitted")).toBeVisible();
  await expect(timeline.getByText("Interaction: call (inbound)")).toBeVisible();
  await expect(timeline.getByText("Phone screen scheduled")).toBeVisible();
  await expect(timeline.getByText("Task completed: Prep phone screen")).toBeVisible();
});
