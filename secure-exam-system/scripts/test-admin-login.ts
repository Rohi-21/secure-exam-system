import * as OTPAuth from "otpauth";
import { prisma } from "../lib/db";
import { decryptTOTPSecret } from "../lib/auth/totp";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(".env.local") });

async function testAdmin() {
  const admin = await prisma.user.findUnique({ where: { usn: "ADMIN001" } });
  if (!admin) {
    console.error("ADMIN001 not found");
    return;
  }

  const secret = decryptTOTPSecret(admin.totpSecret, admin.usn);
  const totp = new OTPAuth.TOTP({
    issuer: "SecureExamSystem",
    label: admin.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const code = totp.generate();
  console.log("Admin current TOTP code:", code);

  // Step 1: Login
  const loginRes = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usn: "ADMIN001",
      password: "DemoPassword@CNS2024!",
      totpCode: code,
    }),
  });

  const loginData = await loginRes.json();
  console.log("Step 1 Login Status:", loginRes.status, loginData);

  if (!loginRes.ok) return;

  // Step 2: Challenge
  const challengeRes = await fetch("http://localhost:3000/api/auth/login/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: loginData.userId,
      challengeNonce: loginData.challengeNonce,
      signature: "no-key-in-memory",
    }),
  });

  const challengeData = await challengeRes.json();
  console.log("Step 2 Challenge Status:", challengeRes.status, challengeData);
}

testAdmin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
