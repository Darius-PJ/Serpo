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

// Mocks /api/raekwon and /api/applications so this test never makes a real
// call to the Claude API or any external job source — same pattern as
// tests/e2e/editor.spec.ts and confirm-dialogs.spec.ts.
test("Generate submits the form payload, renders the leads table + sources hub, and Track works", async ({ page }) => {
  await registerViaUi(page, randomUsername("raekwonflow"));

  let generateBody: Record<string, unknown> | undefined;
  await page.route("**/api/raekwon", async (route) => {
    generateBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        report: {
          id: "fake-report-1",
          batchSize: 5,
          keyword: "backend engineer",
          location: "Remote",
          jobType: "full-time",
          compensationTarget: "$120k+",
          sourcesHubMarkdown: "# Sources\n- **Greenhouse** found the strongest matches this run",
          status: "generated",
          error: null,
        },
        leads: [
          {
            id: "fake-lead-1",
            company: "Nova Systems",
            roleTitle: "Backend Engineer",
            location: "Remote",
            sourceUrl: "https://example.com/jobs/123",
            jobType: "Full-time",
            keyword: "backend engineer",
            salaryOrRate: "$120k+",
            rank: 1,
            explanation: "Strong match for backend keyword and remote preference.",
            duplicateVariantsSuppressed: JSON.stringify([{ role_title: "Backend Software Engineer", source_url: "https://example.com/jobs/999" }]),
          },
        ],
      },
    });
  });

  let trackCalls = 0;
  let trackBody: Record<string, unknown> | undefined;
  await page.route("**/api/applications", async (route) => {
    trackCalls++;
    trackBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { application: { id: "fake-app-1" } } });
  });

  await page.goto("/raekwon");
  await page.locator('input[placeholder="e.g. backend engineer"]').fill("backend engineer");
  await page.locator('input[placeholder="Optional"]').fill("Remote");
  await page.locator("select").first().selectOption("full-time");
  await page.locator('input[placeholder^="e.g. $120k"]').fill("$120k+");
  await page.getByRole("button", { name: "Generate" }).click();

  await expect.poll(() => generateBody).toMatchObject({
    batchSize: 10,
    keyword: "backend engineer",
    location: "Remote",
    jobType: "full-time",
    compensationTarget: "$120k+",
  });

  await expect(page.getByText("Nova Systems")).toBeVisible();
  await expect(page.getByText("+1 similar posting(s) suppressed", { exact: false })).toBeVisible();
  await expect(page.getByText("Best-performing sources")).toBeVisible();
  await expect(page.getByText("found the strongest matches this run", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Track" }).click();
  await expect.poll(() => trackCalls).toBe(1);
  expect(trackBody).toMatchObject({
    company: "Nova Systems",
    role: "Backend Engineer",
    source: "example.com",
    url: "https://example.com/jobs/123",
    status: "Sourced",
  });
  await expect(page.getByRole("button", { name: "Tracked" })).toBeVisible();
});
