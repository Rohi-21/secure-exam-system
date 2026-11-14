import { prisma } from "../lib/db";
import { decryptTOTPSecret, generateCurrentToken } from "../lib/auth/totp";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(".env.local") });

async function check() {
  const users = await prisma.user.findMany({
    select: { usn: true, email: true, name: true, role: true, failedAttempts: true, isLocked: true, totpSecret: true },
  });

  console.log("\nRegistered Users in DB:");
  for (const u of users) {
    let currentTotp = "N/A";
    try {
      const secret = decryptTOTPSecret(u.totpSecret, u.usn);
      currentTotp = generateCurrentToken(secret);
    } catch (e: any) {
      currentTotp = `Error: ${e.message}`;
    }
    console.log(`- USN: ${u.usn} | Email: ${u.email} | Role: ${u.role} | Current Live TOTP: ${currentTotp}`);
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
