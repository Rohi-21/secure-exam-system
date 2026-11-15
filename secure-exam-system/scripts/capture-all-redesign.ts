import { chromium } from "@playwright/test";
import * as OTPAuth from "otpauth";

const DEMO_SECRET = "JBSWY3DPEHPK3PXP";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 1. Unauthenticated screens
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "redesign-home.png", fullPage: true });
  console.log("Captured redesign-home.png");

  await page.goto("http://localhost:3000/register", { waitUntil: "networkidle" });
  await page.screenshot({ path: "redesign-register.png", fullPage: true });
  console.log("Captured redesign-register.png");

  // Mobile viewport for home
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "redesign-home-mobile.png", fullPage: true });
  console.log("Captured redesign-home-mobile.png");

  // Reset to desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });

  // 2. Login as ADMIN001
  const totp = new OTPAuth.TOTP({
    issuer: "SecureExamSystem",
    label: "admin@kletech.ac.in",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(DEMO_SECRET),
  });
  const code = totp.generate();

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.screenshot({ path: "redesign-login.png", fullPage: true });
  console.log("Captured redesign-login.png");

  await page.fill('input[autocomplete="username"], input[placeholder*="01FE"]', "ADMIN001");
  await page.fill('input[type="password"]', "DemoPassword@CNS2024!");
  await page.fill('input[inputmode="numeric"]', code);
  await page.click('button[type="submit"]');

  await page.waitForTimeout(2500);
  console.log("Logged in! URL:", page.url());

  // 3. Authenticated admin screens
  await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "redesign-admin.png", fullPage: true });
  console.log("Captured redesign-admin.png");

  await page.goto("http://localhost:3000/audit", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "redesign-audit.png", fullPage: true });
  console.log("Captured redesign-audit.png");

  await page.goto("http://localhost:3000/users", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "redesign-users.png", fullPage: true });
  console.log("Captured redesign-users.png");

  await page.goto("http://localhost:3000/benchmarks", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "redesign-benchmarks.png", fullPage: true });
  console.log("Captured redesign-benchmarks.png");

  await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "redesign-dashboard.png", fullPage: true });
  console.log("Captured redesign-dashboard.png");

  await page.goto("http://localhost:3000/exams", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "redesign-exams.png", fullPage: true });
  console.log("Captured redesign-exams.png");

  await browser.close();
  console.log("All redesign screenshots captured successfully!");
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});
