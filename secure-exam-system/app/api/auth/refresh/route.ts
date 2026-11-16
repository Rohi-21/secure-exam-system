/**
 * POST /api/auth/refresh
 * Rotate refresh token — invalidates old token, issues new access + refresh tokens.
 * Refresh token is read from httpOnly cookie (never from request body).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signAccessToken, generateRefreshToken } from "@/lib/auth/jwt";
import { sha256Hex } from "@/lib/crypto/hash";

const COOKIE_NAME = "refresh_token";

export async function POST(req: NextRequest) {
  try {
    const rawToken = req.cookies.get(COOKIE_NAME)?.value;
    if (!rawToken) {
      return NextResponse.json({ error: "No refresh token" }, { status: 401 });
    }

    const tokenHash = sha256Hex(Buffer.from(rawToken, "base64url"));

    // ── Find and validate stored token ────────────────────────────────
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) {
      return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
    }

    // RFC 6819 §5.2.2.3 Token Reuse Detection:
    // If a revoked token is presented, suspect token theft and revoke all tokens for this user
    if (stored.revoked) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId },
        data: { revoked: true },
      });
      return NextResponse.json({ error: "Refresh token reuse detected. All sessions revoked." }, { status: 401 });
    }

    if (stored.expiresAt < new Date()) {
      return NextResponse.json({ error: "Expired refresh token" }, { status: 401 });
    }

    // ── Revoke old token ──────────────────────────────────────────────
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    // ── Fetch user ────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.isLocked) {
      return NextResponse.json({ error: "User unavailable" }, { status: 401 });
    }

    // ── Issue new tokens ──────────────────────────────────────────────
    const sessionId = crypto.randomUUID();
    const ecdsaPubKeyHash = user.ecdsaPubKey
      ? sha256Hex(Buffer.from(user.ecdsaPubKey, "utf-8"))
      : "";

    const accessToken = await signAccessToken({
      userId: user.id,
      usn: user.usn,
      role: user.role as "student" | "examiner" | "admin" | "hod",
      sessionId,
      ecdsaPubKeyHash,
    });

    const { token: newRawToken, tokenId, expiresAt } = generateRefreshToken();
    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        tokenHash: sha256Hex(Buffer.from(newRawToken, "base64url")),
        userId: user.id,
        expiresAt,
      },
    });

    const response = NextResponse.json({ accessToken });
    response.cookies.set("auth_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
    response.cookies.set(COOKIE_NAME, newRawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth",
      expires: expiresAt,
    });

    return response;

  } catch (err) {
    console.error("[refresh]", err);
    return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
  }
}
