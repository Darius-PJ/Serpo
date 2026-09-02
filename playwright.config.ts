import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", testMatch: /mobile\.spec\.ts/, use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    // One combined command so DB reset -> verify schema -> build -> serve always
    // runs in that order, rather than relying on Playwright's
    // globalSetup/webServer startup ordering (which isn't guaranteed
    // relative to a separate script). Uses `next build && next start`
    // rather than `next dev`: Next 16's dev-server lockfile blocks a second
    // `next dev`/`next build` instance for the same project directory
    // regardless of port, which would collide with a dev server already
    // running locally — `next start` isn't part of that lock, and testing
    // against a production build is more representative anyway.
    command:
      "node scripts/prepareE2eDatabase.mjs data/e2e.db --reset && npx next build && npx next start -H 127.0.0.1 -p 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: "file:./data/e2e.db",
    },
  },
});
