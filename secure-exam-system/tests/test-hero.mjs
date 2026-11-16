import { chromium } from "@playwright/test";
import path from "path";

const artifactDir = "C:\\Users\\krohi\\.gemini\\antigravity\\brain\\cdb94754-b944-4085-872d-003093a15c59";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const viewports = [
    { name: "1440", width: 1440, height: 900 },
    { name: "1024", width: 1024, height: 768 },
    { name: "768", width: 768, height: 1024 },
    { name: "390", width: 390, height: 844 },
  ];

  console.log("Navigating to http://localhost:3000 ...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(600); // Allow entrance animations to settle

    // Check horizontal scroll / overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    const screenshotPath = path.join(artifactDir, `hero-${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Captured viewport ${vp.name}px (horizontal overflow: ${hasOverflow}) -> hero-${vp.name}.png`);
  }

  // Mobile navigation interaction test at 390px
  await page.setViewportSize({ width: 390, height: 844 });
  const menuButton = page.locator('button[aria-controls="hero-mobile-nav"]');
  const isMenuVisibleInitially = await menuButton.isVisible();
  console.log(`Mobile menu button visible at 390px: ${isMenuVisibleInitially}`);

  if (isMenuVisibleInitially) {
    await menuButton.click();
    await page.waitForTimeout(300);
    const isExpanded = await menuButton.getAttribute("aria-expanded");
    console.log(`Mobile menu aria-expanded after click: ${isExpanded}`);

    const mobileMenuScreenshot = path.join(artifactDir, "hero-390-mobile-menu.png");
    await page.screenshot({ path: mobileMenuScreenshot, fullPage: false });
    console.log(`Captured open mobile menu screenshot -> hero-390-mobile-menu.png`);

    // Press Escape to test accessible dismissal
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const isExpandedAfterEsc = await menuButton.getAttribute("aria-expanded");
    console.log(`Mobile menu aria-expanded after Escape: ${isExpandedAfterEsc}`);
  }

  console.log(`Total console errors during audit: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log("Console errors:", consoleErrors);
  }

  await browser.close();
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
