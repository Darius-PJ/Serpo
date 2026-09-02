import { test, expect } from "@playwright/test";

test("browser extensions can annotate the root element without a hydration error", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const injectDarkReaderMarker = () => {
      document.documentElement?.setAttribute("data-darkreader-proxy-injected", "true");
    };
    injectDarkReaderMarker();
    new MutationObserver(injectDarkReaderMarker).observe(document, { childList: true, subtree: true });
  });

  await page.goto("/dashboard");
  await page.waitForTimeout(500);

  expect(hydrationErrors).toEqual([]);
});

test("keyboard users can skip global navigation to main content", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});
