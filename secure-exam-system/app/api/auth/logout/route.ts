/**
 * POST /api/auth/logout
 * Revoke the refresh token stored in the httpOnly cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto/hash";

const COOKIE_NAME = "refresh_token";

export async function POST(req: NextRequest) {
  try {
    const rawToken = req.cookies.get(COOKIE_NAME)?.value;

    if (rawToken) {
      const tokenHash = sha256Hex(Buffer.from(rawToken, "base64url"));
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revoked: false },
        data: { revoked: true },
      }).catch(() => {}); // Silently ignore if already revoked
    }

    const response = NextResponse.json({ message: "Logged out" });
    // Clear the cookies
    response.cookies.set("auth_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/refresh",
      maxAge: 0,
    });
    return response;

  } catch (err) {
    console.error("[logout]", err);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
