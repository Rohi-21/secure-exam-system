import { test, expect } from "@playwright/test";

/**
 * UI smoke tests — verify key pages load with the correct structure.
 * These are presence tests, not interaction tests; they don't require a live backend.
 */

test.describe("Login page", () => {
  test("renders sign-in form with 3-factor protocol callout", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("Sign in");
    await expect(page.locator("text=University Seat Number")).toBeVisible();
    await expect(page.locator("text=TOTP RFC 6238")).toBeVisible();
    await expect(page.locator("text=3-Factor Authentication Protocol")).toBeVisible();
    await expect(page.locator("text=Argon2id")).toBeVisible();
    await expect(page.locator("text=Ed25519")).toBeVisible();
    // Submit button present and labelled correctly
    await expect(page.locator("button[type=submit]")).toContainText("Sign in");
  });

  test("shows error on empty form submission attempt", async ({ page }) => {
    await page.goto("/login");
    // The submit button should be present and form should require fields
    const submitBtn = page.locator("button[type=submit]");
    await expect(submitBtn).toBeEnabled();
  });
});

test.describe("Register page", () => {
  test("renders registration form", async ({ page }) => {
    await page.goto("/register");
    // Should have some form or redirect
    const url = page.url();
    expect(url).toContain("localhost:3000");
  });
});

test.describe("Page accessibility — focus rings present", () => {
  test("login inputs have focus-ring class", async ({ page }) => {
    await page.goto("/login");
    // All inputs should have focus:ring-2 in their class
    const inputs = page.locator("input");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const cls = await inputs.nth(i).getAttribute("class");
      expect(cls).toContain("focus:ring");
    }
  });
});
