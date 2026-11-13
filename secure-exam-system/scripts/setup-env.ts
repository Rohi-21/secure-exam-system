import { generateKeyPairSync, randomBytes } from "crypto";
import fs from "fs";
import path from "path";

function genEd25519() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return {
    priv: privateKey.replace(/\r?\n/g, "\\n"),
    pub: publicKey.replace(/\r?\n/g, "\\n"),
  };
}

const serverKeys = genEd25519();
const auditKeys = genEd25519();
const totpKey = randomBytes(32).toString("hex");

const envLocal = [
  'DATABASE_URL="file:./dev.db"',
  'JWT_SECRET="cns-project-dev-secret-replace-in-production-with-64-chars-of-random-hex"',
  'JWT_EXPIRES_IN="15m"',
  'JWT_REFRESH_EXPIRES_IN="7d"',
  `SERVER_ED25519_PRIVATE_KEY_PEM="${serverKeys.priv}"`,
  `SERVER_ED25519_PUBLIC_KEY_PEM="${serverKeys.pub}"`,
  `AUDIT_ED25519_PRIVATE_KEY_PEM="${auditKeys.priv}"`,
  `AUDIT_ED25519_PUBLIC_KEY_PEM="${auditKeys.pub}"`,
  `TOTP_ENCRYPTION_KEY="${totpKey}"`,
  'WATERMARK_SECRET_PEPPER="cns-dev-watermark-pepper-replace-in-production"',
  'NEXTAUTH_URL="http://localhost:3000"',
  'NODE_ENV="development"',
  "",
].join("\n");

fs.writeFileSync(path.resolve(".env.local"), envLocal, "utf-8");
console.log("Updated .env.local with live Ed25519 server keys and TOTP secret!");

const envExample = [
  'DATABASE_URL="file:./dev.db"',
  'JWT_SECRET="<64-character-hex-secret>"',
  'JWT_EXPIRES_IN="15m"',
  'JWT_REFRESH_EXPIRES_IN="7d"',
  'SERVER_ED25519_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"',
  'SERVER_ED25519_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----\\n"',
  'AUDIT_ED25519_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"',
  'AUDIT_ED25519_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----\\n"',
  'TOTP_ENCRYPTION_KEY="<32-byte-hex-key>"',
  'WATERMARK_SECRET_PEPPER="<pepper-string>"',
  'NEXTAUTH_URL="http://localhost:3000"',
  'NODE_ENV="production"',
  "",
].join("\n");

fs.writeFileSync(path.resolve(".env.example"), envExample, "utf-8");
console.log("Created .env.example template!");
