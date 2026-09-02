import path from "node:path";
import { test, expect } from "@playwright/test";
import { resetWorkspace } from "./helpers";

// better-sqlite3 has no bundled types; require() avoids adding a
// devDependency just for this one test-only seed helper.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

async function prepareWorkspace(page: import("@playwright/test").Page): Promise<string> {
  await resetWorkspace(page.context().request);
  const db = new Database(path.resolve(process.cwd(), "data", "e2e.db"));
  const row = db.prepare(`SELECT "id" FROM "User" ORDER BY "createdAt", "id" LIMIT 1`).get() as { id: string };
  db.close();
  return row.id;
}

const FAKE_RESUME_JSON = JSON.stringify({
  contactHeader: "Test Person · test@example.com",
  summary: "A summary.",
  experience: [{ employer: "Acme", title: "Engineer", dates: "2020-2024", bullets: ["Did things"] }],
  skills: ["TypeScript"],
  education: [{ institution: "State University", credential: "B.S.", dates: "2016-2020" }],
});

// Seeds a job-targeted workspace directly into the E2E SQLite database —
// no Claude call involved, just plain rows, mirroring the throwaway
// verification scripts used elsewhere in this project (better-sqlite3
// against the same file the webServer's Prisma client points at) — lets
// this test exercise the real server-rendered /resume/[id] page (which a
// mocked /api/resume response can never reach) while staying AI-free.
function seedJobTargetedWorkspace(userId: string, id: string) {
  const db = new Database(path.resolve(process.cwd(), "data", "e2e.db"));
  db.prepare(
    `INSERT INTO ResumeWorkspace
       (id, userId, company, role, benchmarkStatus, benchmarkContent, improvedStatus, improvedContent, meldedStatus, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'generated', ?, 'generated', ?, 'not_started', datetime('now'), datetime('now'))`
  ).run(id, userId, "Acme", "Backend Engineer", FAKE_RESUME_JSON, FAKE_RESUME_JSON);
  db.close();
}

// Mocks /api/jobs/search and /api/resume so this test never makes a real
// network call to any external job API or the Claude API — same pattern as
// tests/e2e/confirm-dialogs.spec.ts and job-search.spec.ts. The real
// /resume/[id] page renders server-side from the DB, which the mocked
// /api/resume call below never touches — asserting on the request payload
// and the navigation itself is the right boundary here, same reasoning
// this codebase already used for the old /api/editor flow.
test("Resume button snapshots the current search and navigates to the workspace", async ({ page }) => {
  await prepareWorkspace(page);

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
  await prepareWorkspace(page);

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
  await prepareWorkspace(page);

  await page.goto("/resume");

  await expect(page.getByText("General resume improvement — not tied to a specific job posting.")).toBeVisible();
  await expect(page.getByText("Your resume, improved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload resume" })).toBeVisible();
  await expect(page.getByText("Reference resume")).toHaveCount(0);
  await expect(page.getByText("Your competition")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Meld" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start fresh" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to search" })).toHaveCount(0);

  // Revisiting finds the same general workspace rather than creating another.
  await page.reload();
  await expect(page.getByText("General resume improvement — not tied to a specific job posting.")).toBeVisible();
});

// A job-targeted workspace is seeded directly into the database (see
// seedJobTargetedWorkspace) so this exercises the real server-rendered
// /resume/[id] page — including the section order and the Meld dropdowns'
// mutual-exclusion logic — without any Claude call. Only the final "Meld"
// button click is mocked, since clicking it would otherwise hit the real
// regenerate endpoint.
test("job-targeted workspace shows Reference, Improved, Benchmark, then Meld with mutually exclusive dropdowns", async ({ page }) => {
  const apiCtx = page.context().request;
  const userId = await prepareWorkspace(page);

  const uploaded = await apiCtx.post("/api/resume-template", {
    multipart: { file: { name: "resume.md", mimeType: "text/markdown", buffer: Buffer.from("# Test Person\nReference resume text.") } },
  });
  expect(uploaded.ok()).toBe(true);

  const workspaceId = "e2e-meld-workspace-1";
  seedJobTargetedWorkspace(userId, workspaceId);

  await page.goto(`/resume/${workspaceId}`);

  const sections = page.locator("section");
  await expect(sections).toHaveCount(4);
  await expect(sections.nth(0).locator("h2").first()).toHaveText("Reference resume");
  await expect(sections.nth(1).locator("h2").first()).toHaveText("Your resume, improved");
  await expect(sections.nth(2).locator("h2").first()).toHaveText("Your competition");
  await expect(sections.nth(3).locator("h2").first()).toHaveText("Meld");

  await expect(page.getByText("Reference resume text.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace resume" })).toBeVisible();

  // Scoped to the Meld section specifically — it also contains the melded
  // ResumeBubble's own (closed, hidden) download-format <select>, which is
  // still present in the DOM and would otherwise be matched first.
  const meldSection = sections.nth(3);
  const meldA = meldSection.locator("select").nth(0);
  const meldB = meldSection.locator("select").nth(1);
  // Each dropdown always excludes whichever source the OTHER dropdown
  // currently holds, so with both pre-populated by default (reference/
  // improved) each starts with the placeholder + the 2 remaining sources.
  await expect(meldA.locator("option")).toHaveCount(3);
  await expect(meldB.locator("option")).toHaveCount(3);

  await meldA.selectOption("benchmark");
  // Once A picks "benchmark", B must no longer offer it.
  await expect(meldB.locator('option[value="benchmark"]')).toHaveCount(0);
  await meldB.selectOption("reference");
  // And now A must no longer offer "reference".
  await expect(meldA.locator('option[value="reference"]')).toHaveCount(0);

  let regenerateBody: Record<string, unknown> | undefined;
  await page.route(`**/api/resume/${workspaceId}/regenerate`, async (route) => {
    regenerateBody = route.request().postDataJSON();
    await route.fulfill({
      json: { workspace: { meldedStatus: "generated", meldedContent: JSON.parse(FAKE_RESUME_JSON), meldedError: null } },
    });
  });

  await page.getByRole("button", { name: "Meld" }).click();

  await expect.poll(() => regenerateBody).toMatchObject({ artifact: "melded", meldSourceA: "benchmark", meldSourceB: "reference" });
});
