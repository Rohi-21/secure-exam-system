import * as OTPAuth from "otpauth";

const DEMO_SECRET = "JBSWY3DPEHPK3PXP";

const totp = new OTPAuth.TOTP({
  issuer: "SecureExamSystem",
  label: "admin@kletech.ac.in",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  secret: OTPAuth.Secret.fromBase32(DEMO_SECRET),
});

const token = totp.generate();
const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);

console.log("\n========================================");
console.log("  🔐 LIVE TOTP CODE (RFC 6238)");
console.log("========================================");
console.log(`  Current 6-Digit Code:  \x1b[1m\x1b[32m${token}\x1b[0m`);
console.log(`  Valid for next:        ${remainingSeconds} seconds`);
console.log("----------------------------------------");
console.log(`  Demo Base32 Secret:    ${DEMO_SECRET}`);
console.log(`  Authenticator URI:     ${totp.toString()}`);
console.log("========================================\n");
