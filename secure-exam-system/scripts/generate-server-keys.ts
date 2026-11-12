/**
 * Server key generation utility
 * Generates Ed25519 key pairs for SERVER_ED25519 and AUDIT_ED25519.
 * Prints keys to stdout in PEM format ready for .env.local
 *
 * Run: npx tsx scripts/generate-server-keys.ts
 */

import { generateKeyPairSync } from "crypto";

function generateEd25519PEM(): { privatePEM: string; publicPEM: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding:  { type: "spki",  format: "pem" },
  });
  return { privatePEM: privateKey as string, publicPEM: publicKey as string };
}

function toCombinedEnvLine(pem: string): string {
  return pem.replace(/\n/g, "\\n");
}

function main() {
  console.log("\n" + "─".repeat(72));
  console.log("CNS Secure Exam System — Server Key Generation");
  console.log("─".repeat(72));

  console.log("\n📌 Generating SERVER_ED25519 key pair (session binding + ECDH handshake signing)…");
  const serverKeys = generateEd25519PEM();
  console.log("\nServer Private Key (keep SECRET — never commit):");
  console.log(serverKeys.privatePEM);
  console.log("Server Public Key (safe to distribute):");
  console.log(serverKeys.publicPEM);

  console.log("\n📌 Generating AUDIT_ED25519 key pair (audit chain signing + result signing)…");
  const auditKeys = generateEd25519PEM();
  console.log("\nAudit Private Key (keep SECRET — never commit):");
  console.log(auditKeys.privatePEM);
  console.log("Audit Public Key (safe to distribute):");
  console.log(auditKeys.publicPEM);

  console.log("\n" + "─".repeat(72));
  console.log("Add these lines to your .env.local:");
  console.log("─".repeat(72));
  console.log(`SERVER_ED25519_PRIVATE_KEY_PEM="${toCombinedEnvLine(serverKeys.privatePEM)}"`);
  console.log(`SERVER_ED25519_PUBLIC_KEY_PEM="${toCombinedEnvLine(serverKeys.publicPEM)}"`);
  console.log(`AUDIT_ED25519_PRIVATE_KEY_PEM="${toCombinedEnvLine(auditKeys.privatePEM)}"`);
  console.log(`AUDIT_ED25519_PUBLIC_KEY_PEM="${toCombinedEnvLine(auditKeys.publicPEM)}"`);
  console.log("─".repeat(72));
  console.log("\n✅ Done. Store private keys securely. Rotate before production.\n");
}

main();
