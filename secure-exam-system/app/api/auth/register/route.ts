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
import { generateTOTPSecret, generateTOTPUri, encryptTOTPSecret } from "@/lib/auth/totp";
import { prisma } from "@/lib/db";

const ALLOWED_ROLES = ["student", "examiner", "admin", "hod"] as const;


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { usn, email, name, password, ed25519PubKey, ecdsaPubKey } = body;

    // ── Input validation ───────────────────────────────────────────────
    if (!usn || !email || !name || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    // Security policy: Public self-registration ALWAYS provisions "student" role.
    // Privileged accounts (examiner, admin, hod) must be created by an authorized admin.
    const role = "student";

    if (password.length < 12) {
      return NextResponse.json({ error: "Password must be at least 12 characters" }, { status: 400 });
    }
    if (!ed25519PubKey || !ecdsaPubKey) {
      return NextResponse.json(
        { error: "Browser-generated public keys required. Ensure JavaScript and WebCrypto are enabled." },
        { status: 400 }
      );
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // ── Duplicate check (case-insensitive) ─────────────────────────────
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { usn: cleanUsn },
          { email: cleanEmail },
        ],
      },
    });
    if (existing) {
      return NextResponse.json({ error: "USN or email already registered" }, { status: 409 });
    }

    // ── Argon2id password hash ──────────────────────────────────────────
    const passwordHash = await argon2idHash(password);

    // ── TOTP secret generation + server-side encryption ────────────────
    const { secretBase32 } = generateTOTPSecret();
    const totpStorageJson = encryptTOTPSecret(secretBase32, cleanUsn);


    // ── Create user record ──────────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        usn: cleanUsn,
        email: cleanEmail,
        name: cleanName,
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
