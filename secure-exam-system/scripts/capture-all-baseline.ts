import { chromium } from "playwright";
import * as OTPAuth from "otpauth";

const DEMO_SECRET = "JBSWY3DPEHPK3PXP";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Generate TOTP
  const totp = new OTPAuth.TOTP({
    issuer: "SecureExamSystem",
    label: "admin@kletech.ac.in",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(DEMO_SECRET),
  });
  const code = totp.generate();

  console.log("Logging in as ADMIN001...");
  await page.goto("http://localhost:3000/login");
  await page.fill('input[type="text"]', "ADMIN001");
  await page.fill('input[type="password"]', "DemoPassword@CNS2024!");
  await page.fill('input[inputmode="numeric"], input[placeholder*="000"]', code);
  await page.click('button[type="submit"]');

  await page.waitForTimeout(2000);
  console.log("Current URL after admin login:", page.url());
  await page.screenshot({ path: "baseline-admin.png" });

  await page.goto("http://localhost:3000/audit");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "baseline-audit.png" });

  await page.goto("http://localhost:3000/users");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "baseline-users.png" });

  await page.goto("http://localhost:3000/benchmarks");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "baseline-benchmarks.png" });

  await page.goto("http://localhost:3000/dashboard");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "baseline-dashboard.png" });

  await page.goto("http://localhost:3000/exams");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "baseline-exams.png" });

  await browser.close();
  console.log("All baseline screenshots captured!");
}

capture().catch(console.error);
