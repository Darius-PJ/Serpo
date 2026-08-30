import { test, expect } from "@playwright/test";
import { randomUsername, E2E_PASSWORD } from "./helpers";

async function registerViaUi(page: import("@playwright/test").Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="new-password"]').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard");
}

test("wipe-all only fires after confirming the dialog, not on the initial click", async ({ page }) => {
  await registerViaUi(page, randomUsername("wipeui"));

  let purgeCalls = 0;
  await page.route("**/api/privacy/purge", async (route) => {
    purgeCalls++;
    await route.fulfill({ json: { result: { applications: 0, resumeTemplates: 0, profileFields: 0, jobBoards: 0 } } });
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Wipe all my data" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  expect(purgeCalls).toBe(0);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(purgeCalls).toBe(0);

  await page.getByRole("button", { name: "Wipe all my data" }).click();
  await page.getByRole("button", { name: "Yes, wipe everything" }).click();
  await expect.poll(() => purgeCalls).toBe(1);
});

test("auto-apply only fires after confirming the dialog", async ({ page }) => {
  await registerViaUi(page, randomUsername("applyui"));
  const apiCtx = page.context().request;

  const created = await apiCtx.post("/api/applications", {
    headers: { "Content-Type": "application/json" },
    data: { company: "Acme", role: "Engineer", url: "https://example.com/apply", source: "manual" },
  });
  expect(created.ok()).toBe(true);
  const { application } = await created.json();

  const uploaded = await apiCtx.post("/api/resume-template", {
    multipart: {
      file: { name: "resume.md", mimeType: "text/markdown", buffer: Buffer.from("# Jane Doe\nEngineer.") },
    },
  });
  expect(uploaded.ok()).toBe(true);

  let applyCalls = 0;
  await page.route(`**/api/applications/${application.id}/apply`, async (route) => {
    applyCalls++;
    await route.fulfill({ json: { run: { id: "fake", status: "submitted" } } });
  });

  await page.goto(`/applications/${application.id}`);
  await page.getByRole("button", { name: "Tailor & fill form" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  expect(applyCalls).toBe(0);

  await page.getByRole("button", { name: "Cancel" }).click();
  expect(applyCalls).toBe(0);

  await page.getByRole("button", { name: "Tailor & fill form" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect.poll(() => applyCalls).toBe(1);
});

test("decision-maker research shows an editable, pre-filled domain guess and only fires on confirm", async ({ page }) => {
  await registerViaUi(page, randomUsername("dmui"));
  const apiCtx = page.context().request;

  const created = await apiCtx.post("/api/applications", {
    headers: { "Content-Type": "application/json" },
    data: { company: "Acme Corp", role: "Engineer", source: "manual" },
  });
  const { application } = await created.json();

  let dmCalls = 0;
  await page.route(`**/api/applications/${application.id}/contacts`, async (route) => {
    dmCalls++;
    await route.fulfill({ json: { created: [], runs: [] } });
  });

  await page.goto(`/applications/${application.id}`);
  await page.getByRole("button", { name: "Research contacts" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();

  const domainInput = page.locator("dialog input");
  await expect(domainInput).toHaveValue("acmecorp.com");
  expect(dmCalls).toBe(0);

  // exact: the page's "Research contacts" button also substring-matches "Research".
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect.poll(() => dmCalls).toBe(1);
});
