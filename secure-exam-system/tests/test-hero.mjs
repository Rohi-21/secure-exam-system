import { chromium } from "@playwright/test";
import path from "path";
import assert from "node:assert";

const artifactDir = "C:\\Users\\krohi\\.gemini\\antigravity\\brain\\cdb94754-b944-4085-872d-003093a15c59";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  const viewports = [
    { name: "1440", width: 1440, height: 900, label: "Desktop" },
    { name: "1024", width: 1024, height: 768, label: "Laptop" },
    { name: "768", width: 768, height: 1024, label: "Tablet" },
    { name: "390", width: 390, height: 844, label: "Mobile" },
  ];

  console.log("Navigating to http://localhost:3000 ...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  // 1. Viewport verification & horizontal overflow assertions
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500); // Allow entrance animations to settle

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    // Explicit assertion: horizontal overflow causes test failure
    assert.strictEqual(
      hasOverflow,
      false,
      `Horizontal overflow detected at viewport ${vp.name}px (${vp.label})!`
    );

    const screenshotPath = path.join(artifactDir, `hero-${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[PASS] Captured ${vp.label} (${vp.name}px) -> hero-${vp.name}.png`);
  }

  // 2. CTA Destination Verifications
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);

  const primaryCTAs = await page.locator('a:has-text("Access Platform")').all();
  let foundVisiblePrimary = false;
  for (const cta of primaryCTAs) {
    if (await cta.isVisible()) {
      foundVisiblePrimary = true;
      const href = await cta.getAttribute("href");
      assert.strictEqual(href, "/login", `Primary CTA must target '/login', got: ${href}`);
    }
  }
  assert.strictEqual(foundVisiblePrimary, true, "At least one visible Primary Access Platform CTA must exist on desktop");

  const secondaryCTA = page.locator('a:has-text("Explore Security")').first();
  const secondaryVisible = await secondaryCTA.isVisible();
  assert.strictEqual(secondaryVisible, true, "Secondary Explore Security CTA must be visible on desktop");
  const secondaryHref = await secondaryCTA.getAttribute("href");
  assert.strictEqual(secondaryHref, "#security", `Secondary CTA must target '#security', got: ${secondaryHref}`);

  // Verify navigation anchor sections exist on page
  const navTargets = ["#platform", "#security", "#how-it-works", "#about"];
  for (const target of navTargets) {
    const sectionExists = await page.locator(target).count();
    assert(
      sectionExists > 0,
      `Navigation target section '${target}' must exist in the DOM`
    );
  }
  console.log("[PASS] Verified all CTA destinations and navigation anchor targets (/login, #security, #platform, #how-it-works, #about)");

  // 3. Mobile Navigation & Escape Dismissal Tests
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  const menuButton = page.locator('button[aria-controls="hero-mobile-nav"]');
  const isMenuVisibleInitially = await menuButton.isVisible();
  assert.strictEqual(isMenuVisibleInitially, true, "Mobile menu toggle button must be visible at 390px");

  // Initial aria state must be false
  const initialExpanded = await menuButton.getAttribute("aria-expanded");
  assert.strictEqual(initialExpanded, "false", "Initial aria-expanded state must be 'false'");

  // Click to open
  await menuButton.click();
  await page.waitForTimeout(300);

  const isExpandedAfterClick = await menuButton.getAttribute("aria-expanded");
  assert.strictEqual(isExpandedAfterClick, "true", "Mobile menu button must have aria-expanded='true' after click");

  const isNavDialogVisible = await page.locator("#hero-mobile-nav").isVisible();
  assert.strictEqual(isNavDialogVisible, true, "Mobile navigation sheet must be visible when opened");

  const mobileMenuScreenshot = path.join(artifactDir, "hero-390-mobile-menu.png");
  await page.screenshot({ path: mobileMenuScreenshot, fullPage: false });
  console.log("[PASS] Mobile menu opened and captured -> hero-390-mobile-menu.png");

  // Press Escape to test accessible dismissal
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const isExpandedAfterEsc = await menuButton.getAttribute("aria-expanded");
  assert.strictEqual(
    isExpandedAfterEsc,
    "false",
    "Mobile menu button must have aria-expanded='false' after pressing Escape"
  );
  console.log("[PASS] Mobile menu successfully dismissed via Escape key");

  // 4. Assert zero unexpected browser console errors
  assert.strictEqual(
    consoleErrors.length,
    0,
    `Unexpected browser console errors found: ${JSON.stringify(consoleErrors)}`
  );
  console.log(`[PASS] Zero console errors detected during full test run`);

  await browser.close();
  console.log("\nAll Playwright assertions passed successfully!");
}

run().catch((err) => {
  console.error("\n[FAIL] Playwright Verification Failure:", err);
  process.exit(1);
});
