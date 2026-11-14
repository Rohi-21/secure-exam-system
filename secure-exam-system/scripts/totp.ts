import * as OTPAuth from "otpauth";
import { prisma } from "../lib/db";
import { decryptTOTPSecret } from "../lib/auth/totp";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(".env.local") });

const DEMO_SECRET = "JBSWY3DPEHPK3PXP";

async function main() {
  const targetUSN = process.argv[2]?.trim();
  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);

  if (targetUSN) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { usn: targetUSN },
          { usn: targetUSN.toUpperCase() },
          { usn: targetUSN.toLowerCase() },
          { email: targetUSN.toLowerCase() },
        ],
      },
    });

    if (!user) {
      console.log(`\n❌ User '${targetUSN}' not found in database.`);
      console.log("Run 'npm run totp' without arguments to see all registered accounts.\n");
      return;
    }

    try {
      const secret = decryptTOTPSecret(user.totpSecret, user.usn);
      const totp = new OTPAuth.TOTP({
        issuer: "SecureExamSystem",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();

      console.log("\n========================================");
      console.log(`  🔐 TOTP CODE for ${user.usn} (${user.email})`);
      console.log("========================================");
      console.log(`  Current 6-Digit Code:  \x1b[1m\x1b[32m${code}\x1b[0m`);
      console.log(`  Valid for next:        ${remainingSeconds} seconds`);
      console.log("========================================\n");
    } catch (e: any) {
      console.error("Failed to decrypt TOTP secret for user:", e.message);
    }
    return;
  }

  // Default: Show demo code and list all active users with their live codes
  const defaultTotp = new OTPAuth.TOTP({
    issuer: "SecureExamSystem",
    label: "admin@kletech.ac.in",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(DEMO_SECRET),
  });
  const defaultCode = defaultTotp.generate();

  console.log("\n========================================");
  console.log("  🔐 LIVE TOTP CODES (RFC 6238)");
  console.log("========================================");
  console.log(`  Demo Accounts (ADMIN001, EX001): \x1b[1m\x1b[32m${defaultCode}\x1b[0m (${remainingSeconds}s left)`);
  console.log("----------------------------------------");
  console.log("  Registered Users:");

  try {
    const users = await prisma.user.findMany({
      select: { usn: true, email: true, role: true, totpSecret: true },
      orderBy: { createdAt: "asc" },
    });

    for (const u of users) {
      try {
        const secret = decryptTOTPSecret(u.totpSecret, u.usn);
        const uTotp = new OTPAuth.TOTP({
          issuer: "SecureExamSystem",
          label: u.email,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(secret),
        });
        const uCode = uTotp.generate();
        console.log(`  • \x1b[1m${u.usn}\x1b[0m (${u.role}): \x1b[32m${uCode}\x1b[0m`);
      } catch {
        console.log(`  • ${u.usn} (${u.role}): [unable to compute]`);
      }
    }
  } catch (err) {
    // If DB fails, demo code was still displayed
  }

  console.log("========================================");
  console.log("  Tip: Run 'npm run totp <USN>' for a specific account.");
  console.log("========================================\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
