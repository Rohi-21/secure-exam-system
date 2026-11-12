/**
 * POST /api/auth/register
 * Step 1 of registration:
 *  - Accept { usn, email, name, password, role, ed25519PubKey, ecdsaPubKey }
 *  - Private keys are NEVER sent here — generated in browser via WebCrypto
 *  - Hash password with Argon2id
 *  - Generate and encrypt TOTP secret
 *  - Store user record + public keys
 *  - Return TOTP QR URI for user to scan
 */

import { NextRequest, NextResponse } from "next/server";
import { argon2idHash } from "@/lib/crypto/kdf";
import { encryptAES256GCM } from "@/lib/crypto/aes";
import { hkdfDerive } from "@/lib/crypto/kdf";
import { generateTOTPSecret, generateTOTPUri } from "@/lib/auth/totp";
import { prisma } from "@/lib/db";

const ALLOWED_ROLES = ["student", "examiner", "admin", "hod"] as const;

function getServerTOTPKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return hkdfDerive(Buffer.from(secret, "utf-8"), null, "totp-secret-encryption-key", 32);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { usn, email, name, password, role, ed25519PubKey, ecdsaPubKey } = body;

    // ── Input validation ───────────────────────────────────────────────
    if (!usn || !email || !name || !password || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (password.length < 12) {
      return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
    }
    if (!ed25519PubKey || !ecdsaPubKey) {
      return NextResponse.json(
        { error: "Browser-generated public keys required. Ensure JavaScript and WebCrypto are enabled." },
        { status: 400 }
      );
    }

    // ── Duplicate check ────────────────────────────────────────────────
    const existing = await prisma.user.findFirst({
      where: { OR: [{ usn }, { email }] },
    });
    if (existing) {
      return NextResponse.json({ error: "USN or email already registered" }, { status: 409 });
    }

    // ── Argon2id password hash ──────────────────────────────────────────
    const passwordHash = await argon2idHash(password);

    // ── TOTP secret generation + server-side encryption ────────────────
    const { secretBase32, secretHex } = generateTOTPSecret();
    const totpKey = getServerTOTPKey();
    const encryptedTOTP = encryptAES256GCM(
      totpKey,
      Buffer.from(secretBase32, "utf-8"),
      {
        record_id: `totp-${usn}`,
        record_type: "totp_secret",
        key_version: 1,
        algorithm: "AES-256-GCM",
      }
    );

    // Store as compact JSON — ciphertext|authTag|iv (all base64)
    const totpStorageJson = JSON.stringify({
      c: encryptedTOTP.ciphertext,
      t: encryptedTOTP.authTag,
      i: encryptedTOTP.iv,
    });

    // ── Create user record ──────────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        usn,
        email,
        name,
        role,
        passwordHash,
        totpSecret: totpStorageJson,
        ed25519PubKey,
        ecdsaPubKey,
      },
    });

    // ── Return TOTP QR URI (one-time, never stored raw) ─────────────────
    const totpUri = generateTOTPUri(email, secretBase32);

    return NextResponse.json({
      message: "Registration step 1 complete. Scan the QR code with your authenticator app.",
      userId: user.id,
      totpUri, // Frontend renders this as a QR code image
    }, { status: 201 });

  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
