/**
 * POST /api/auth/register/verify-totp
 * Step 2 of registration — confirm the user has successfully scanned and
 * set up their authenticator app by verifying one TOTP code.
 *
 * Body: { userId, totpCode }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptAES256GCM } from "@/lib/crypto/aes";
import { hkdfDerive } from "@/lib/crypto/kdf";
import { verifyTOTP } from "@/lib/auth/totp";

function getServerTOTPKey(): Buffer {
  const secret = process.env.JWT_SECRET!;
  return hkdfDerive(Buffer.from(secret, "utf-8"), null, "totp-secret-encryption-key", 32);
}

export async function POST(req: NextRequest) {
  try {
    const { userId, totpCode } = await req.json();

    if (!userId || !totpCode) {
      return NextResponse.json({ error: "Missing userId or totpCode" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Decrypt TOTP secret
    const stored = JSON.parse(user.totpSecret);
    const totpKey = getServerTOTPKey();
    const aad = {
      record_id: `totp-${user.usn}`,
      record_type: "totp_secret" as const,
      key_version: 1,
      algorithm: "AES-256-GCM" as const,
    };
    const secretBase32Buf = decryptAES256GCM(totpKey, {
      ciphertext: stored.c,
      authTag: stored.t,
      iv: stored.i,
      aad: JSON.stringify(aad),
      algorithm: "AES-256-GCM",
    }, aad);

    const secretBase32 = secretBase32Buf.toString("utf-8");

    if (!verifyTOTP(secretBase32, totpCode)) {
      return NextResponse.json({ error: "Invalid TOTP code. Check your authenticator app." }, { status: 400 });
    }

    return NextResponse.json({ message: "TOTP verified. Registration complete. You can now log in." });

  } catch (err) {
    console.error("[verify-totp]", err);
    return NextResponse.json({ error: "TOTP verification failed" }, { status: 500 });
  }
}
