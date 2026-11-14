/**
 * POST /api/auth/register/verify-totp
 * Step 2 of registration — confirm the user has successfully scanned and
 * set up their authenticator app by verifying one TOTP code.
 *
 * Body: { userId, totpCode }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyTOTP, decryptTOTPSecret } from "@/lib/auth/totp";

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

    // Decrypt TOTP secret using shared authoritative helper
    let secretBase32: string;
    try {
      secretBase32 = decryptTOTPSecret(user.totpSecret, user.usn);
    } catch (decErr) {
      console.error("[verify-totp] Decryption failed:", decErr);
      return NextResponse.json({ error: "Server error: unable to decrypt TOTP secret" }, { status: 500 });
    }

    if (!verifyTOTP(secretBase32, totpCode)) {
      return NextResponse.json({ error: "Invalid TOTP code. Check your authenticator app." }, { status: 400 });
    }

    return NextResponse.json({ message: "TOTP verified. Registration complete. You can now log in." });

  } catch (err) {
    console.error("[verify-totp]", err);
    return NextResponse.json({ error: "TOTP verification failed" }, { status: 500 });
  }
}

