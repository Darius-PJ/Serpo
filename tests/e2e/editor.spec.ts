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

// Mocks both /api/jobs/search and /api/editor so this test never makes a
// real network call to any external job API or the Claude API — same
// pattern as tests/e2e/confirm-dialogs.spec.ts and job-search.spec.ts.
test("Resume button on a search result creates a draft and navigates to the Editor", async ({ page }) => {
  await registerViaUi(page, randomUsername("editorflow"));

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
  await page.route("**/api/editor", async (route) => {
    createCalls++;
    lastBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        draft: {
          id: "fake-draft-1",
          status: "generated",
          error: null,
          content: {
            contactHeader: "Alex Morgan · alex.morgan@example.com",
            summary: "Illustrative candidate summary.",
            experience: [],
            skills: [],
            education: [],
          },
        },
      },
    });
  });

  await page.goto("/sourcing");
  await page.locator('input[placeholder^="Job title"]').fill("backend engineer");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Backend Engineer")).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();

  await expect.poll(() => createCalls).toBe(1);
  expect(lastBody).toMatchObject({
    company: "Acme",
    role: "Backend Engineer",
    jobDescription: "We need a backend engineer with TypeScript experience.",
    sourceUrl: "https://example.com/job/1",
  });

  // The real /editor/[id] page renders server-side from the DB, which the
  // mocked /api/editor call above never touched — asserting on the
  // navigation itself is the right boundary here (the client only knows to
  // push to whatever id the route returns); the page's own rendering for a
  // real draft is covered separately via a live-generated draft, not a
  // fake id that would 404.
  await page.waitForURL("**/editor/fake-draft-1");
});
