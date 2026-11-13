/**
 * POST /api/auth/login
 * Step 1 of login — verify password (Argon2id) + TOTP.
 * On success: issues an Ed25519 session challenge nonce.
 * The browser must sign this nonce with its Ed25519 private key to complete login.
 *
 * Body: { usn, password, totpCode }
 * Returns: { challengeNonce } on success
 *
 * Rate limiting: 5 failed attempts → 15-minute lockout (enforced server-side)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { argon2idVerify } from "@/lib/crypto/kdf";
import { decryptAES256GCM } from "@/lib/crypto/aes";
import { hkdfDerive } from "@/lib/crypto/kdf";
import { verifyTOTP } from "@/lib/auth/totp";
import { issueChallenge } from "@/lib/auth/session";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function getServerTOTPKey(): Buffer {
  if (process.env.TOTP_ENCRYPTION_KEY) {
    return Buffer.from(process.env.TOTP_ENCRYPTION_KEY, "hex");
  }
  return hkdfDerive(
    Buffer.from(process.env.JWT_SECRET!, "utf-8"),
    null,
    "totp-secret-encryption-key",
    32
  );
}

function getClientIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);

  try {
    const { usn, password, totpCode } = await req.json();

    if (!usn || !password || !totpCode) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    // ── Find user ─────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { usn } });

    // ── Account lockout check ─────────────────────────────────────────
    if (user?.isLocked && user.lockedUntil && user.lockedUntil > new Date()) {
      await prisma.loginAttempt.create({
        data: { usn, ipAddress: ip, success: false },
      });
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { error: `Account locked. Try again in ${remaining} minutes.` },
        { status: 429 }
      );
    }

    // ── Constant-time: always verify password even if user not found ───
    // (prevents timing-based user enumeration)
    const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$invalid";
    const passwordOk = user
      ? await argon2idVerify(user.passwordHash, password)
      : await argon2idVerify(dummyHash, password).catch(() => false);

    if (!user || !passwordOk) {
      // Record failed attempt
      if (user) {
        const newFailCount = (user.failedAttempts ?? 0) + 1;
        const shouldLock = newFailCount >= MAX_ATTEMPTS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: newFailCount,
            isLocked: shouldLock,
            lockedUntil: shouldLock
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
              : undefined,
          },
        });
      }
      await prisma.loginAttempt.create({ data: { usn, ipAddress: ip, success: false } });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // ── Verify TOTP ───────────────────────────────────────────────────
    const stored = JSON.parse(user.totpSecret);
    const totpKey = getServerTOTPKey();
    const aad = {
      record_id: `totp-${user.usn}`,
      record_type: "totp_secret" as const,
      key_version: 1,
      algorithm: "AES-256-GCM" as const,
    };
    const secretBase32 = decryptAES256GCM(totpKey, {
      ciphertext: stored.c, authTag: stored.t, iv: stored.i,
      aad: JSON.stringify(aad), algorithm: "AES-256-GCM",
    }, aad).toString("utf-8");

    if (!verifyTOTP(secretBase32, totpCode, user.id)) {
      await prisma.loginAttempt.create({ data: { usn, ipAddress: ip, success: false } });
      return NextResponse.json({ error: "Invalid TOTP code" }, { status: 401 });
    }

    // ── 2FA passed — reset failed attempts, issue Ed25519 challenge ───
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, isLocked: false, lockedUntil: null },
    });
    await prisma.loginAttempt.create({ data: { usn, ipAddress: ip, success: true } });

    const challengeNonce = issueChallenge(user.id);

    return NextResponse.json({ challengeNonce, userId: user.id });

  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
