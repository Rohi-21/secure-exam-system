/**
 * POST /api/auth/login/challenge
 * Step 2 of login — Ed25519 session binding challenge-response.
 * Browser signs the challengeNonce with its Ed25519 private key.
 * Server verifies, then issues access token + refresh token.
 *
 * Body: { userId, challengeNonce, signature (base64 Ed25519 sig of nonce hex bytes) }
 * Returns: { accessToken } in body, refreshToken in httpOnly cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyChallenge } from "@/lib/auth/session";
import { signAccessToken, generateRefreshToken } from "@/lib/auth/jwt";
import { sha256Hex } from "@/lib/crypto/hash";

const COOKIE_NAME = "refresh_token";

export async function POST(req: NextRequest) {
  try {
    const { userId, challengeNonce, signature } = await req.json();

    if (!userId || !challengeNonce || !signature) {
      return NextResponse.json({ error: "Missing challenge response" }, { status: 400 });
    }

    // ── Fetch user and their Ed25519 public key ───────────────────────
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.ed25519PubKey) {
      return NextResponse.json({ error: "User not found or no Ed25519 key registered" }, { status: 404 });
    }

    // ── Verify Ed25519 challenge response ─────────────────────────────
    const { valid, userId: verifiedUserId } = verifyChallenge(
      challengeNonce,
      signature,
      user.ed25519PubKey
    );

    if (!valid || verifiedUserId !== userId) {
      return NextResponse.json({ error: "Session binding verification failed" }, { status: 401 });
    }

    // ── Issue access token (15 min) ───────────────────────────────────
    const sessionId = crypto.randomUUID();
    const ecdsaPubKeyHash = user.ecdsaPubKey ? sha256Hex(Buffer.from(user.ecdsaPubKey, "utf-8")) : "";

    const accessToken = await signAccessToken({
      userId: user.id,
      usn: user.usn,
      role: user.role as "student" | "examiner" | "admin" | "hod",
      sessionId,
      ecdsaPubKeyHash,
    });

    // ── Issue refresh token (7 days) — stored hashed in DB ───────────
    const { token: rawRefreshToken, tokenId, expiresAt } = generateRefreshToken();
    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        tokenHash: sha256Hex(Buffer.from(rawRefreshToken, "base64url")),
        userId: user.id,
        expiresAt,
      },
    });

    // ── Set refresh token as httpOnly, Secure, SameSite=Strict cookie ─
    const response = NextResponse.json({
      accessToken,
      user: {
        id: user.id,
        usn: user.usn,
        name: user.name,
        role: user.role,
      },
    });

    response.cookies.set("auth_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    response.cookies.set(COOKIE_NAME, rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/refresh",
      expires: expiresAt,
    });

    return response;

  } catch (err) {
    console.error("[login/challenge]", err);
    return NextResponse.json({ error: "Challenge verification failed" }, { status: 500 });
  }
}
