import * as OTPAuth from "otpauth";
import { prisma } from "../lib/db";
import { decryptTOTPSecret } from "../lib/auth/totp";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(".env.local") });

async function test() {
  const user = await prisma.user.findFirst({ where: { usn: "01fe23bar045" } });
  if (!user) {
    console.log("User not found");
    return;
  }
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
  console.log("Generated code for", user.usn, ":", code);

  // Test with UPPERCASE USN (as entered by the user in the screenshot)
  const res = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usn: "01FE23BAR045",
      password: "DemoPassword@CNS2024!", // or whatever was used
      totpCode: code,
    }),
  });
  const data = await res.json();
  console.log("Status:", res.status, "Response:", data);
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
