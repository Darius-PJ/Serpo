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

// The heading card lays its children out in a row above 767px, and its last child
// keeps its width (globals.css), so a page that puts the title and description
// straight in the card instead of in one wrapper <div> pushes the description out
// past the card's edge. The card clips it, so the page itself never scrolls sideways.
test("every page's heading text wraps inside its card in a narrow window", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/dashboard");
  const routes = await page
    .getByRole("navigation", { name: "Primary navigation" })
    .locator('a[href^="/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")!));
  expect(routes).toContain("/companies");

  const overflows: string[] = [];
  for (const route of routes) {
    await page.goto(route);
    const pageOverflows = await page.locator(".page-heading").evaluateAll((cards) =>
      cards.flatMap((card) => {
        const contentRight = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
        return [...card.children]
          .map((child) => Math.round(child.getBoundingClientRect().right - contentRight))
          .filter((overflow) => overflow > 1)
          .map((overflow) => `${overflow}px past the card`);
      }),
    );
    overflows.push(...pageOverflows.map((overflow) => `${route}: ${overflow}`));
  }
  expect(overflows).toEqual([]);
});
