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

// Mocks /api/jobs/search and /api/resume so this test never makes a real
// network call to any external job API or the Claude API — same pattern as
// tests/e2e/confirm-dialogs.spec.ts and job-search.spec.ts. The real
// /resume/[id] page renders server-side from the DB, which the mocked
// /api/resume call below never touches — asserting on the request payload
// and the navigation itself is the right boundary here, same reasoning
// this codebase already used for the old /api/editor flow.
test("Resume button snapshots the current search and navigates to the workspace", async ({ page }) => {
  await registerViaUi(page, randomUsername("resumeflow"));

  await page.route("**/api/jobs/search", async (route) => {
    await route.fulfill({
      json: {
        results: [
          {
            source: "remotive",
            label: "Remotive",
            listings: [
              {
                id: "remotive:1",
                source: "remotive",
                company: "Acme",
                role: "Backend Engineer",
                location: "Remote",
                url: "https://example.com/job/1",
                description: "We need a backend engineer with TypeScript experience.",
              },
            ],
          },
        ],
        suggestedTitles: [],
      },
    });
  });

  let createCalls = 0;
  let lastBody: Record<string, unknown> | undefined;
  await page.route("**/api/resume", async (route) => {
    createCalls++;
    lastBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { workspace: { id: "fake-workspace-1" } },
    });
  });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill("backend engineer");
  await page.locator('input[placeholder^="Location"]').fill("Remote");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Backend Engineer")).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();

  await expect.poll(() => createCalls).toBe(1);
  expect(lastBody).toMatchObject({
    company: "Acme",
    role: "Backend Engineer",
    jobDescription: "We need a backend engineer with TypeScript experience.",
    sourceUrl: "https://example.com/job/1",
    originSearchQuery: "keywords=backend+engineer&location=Remote&remoteOnly=false",
  });

  await page.waitForURL("**/resume/fake-workspace-1");
});

// Exercises the Back button's actual mechanism directly: JobSearchForm reads
// keywords/location/remoteOnly off the URL on mount and auto-runs the
// search, so a workspace's stored originSearchQuery genuinely restores
// results instead of landing on a blank form.
test("landing on /sourcing with a search querystring restores results automatically", async ({ page }) => {
  await registerViaUi(page, randomUsername("resumeback"));

  let searchCalls = 0;
  let lastBody: Record<string, unknown> | undefined;
  await page.route("**/api/jobs/search", async (route) => {
    searchCalls++;
    lastBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        results: [
          {
            source: "remotive",
            label: "Remotive",
            listings: [
              {
                id: "remotive:1",
                source: "remotive",
                company: "Acme",
                role: "Backend Engineer",
                location: "Remote",
                url: "https://example.com/job/1",
              },
            ],
          },
        ],
        suggestedTitles: [],
      },
    });
  });

  await page.goto("/sourcing?keywords=backend+engineer&location=Remote&remoteOnly=false");

  await expect.poll(() => searchCalls).toBe(1);
  expect(lastBody).toMatchObject({ keywords: "backend engineer", location: "Remote", remoteOnly: false });
  await expect(page.getByText("Backend Engineer")).toBeVisible();
  await expect(page.locator('input[placeholder^="Job title"]')).toHaveValue("backend engineer");
});

// Visiting /resume with no job posting loaded creates (or finds) a
// "general" workspace (company/role both null) entirely via a plain
// database write — no Claude call involved — so this is tested for real
// against the live rendered page rather than mocked.
test("visiting the Resume tab with no job posting loaded shows only the Improved workflow", async ({ page }) => {
  await registerViaUi(page, randomUsername("resumefresh"));

  await page.goto("/resume");

  await expect(page.getByText("General resume improvement — not tied to a specific job posting.")).toBeVisible();
  await expect(page.getByText("Your resume, improved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload resume" })).toBeVisible();
  await expect(page.getByText("Your competition")).toHaveCount(0);
  await expect(page.getByText("Meld: where you could grow")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start fresh" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to search" })).toHaveCount(0);

  // Revisiting finds the same general workspace rather than creating another.
  await page.reload();
  await expect(page.getByText("General resume improvement — not tied to a specific job posting.")).toBeVisible();
});
