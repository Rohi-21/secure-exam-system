/**
 * /api/admin/users
 *
 * Privileged user provisioning endpoint.
 * Only authenticated administrators (role: "admin" | "hod") can create or list users.
 * This prevents public privilege escalation while enabling administrator management of
 * examiners, HODs, and trustees.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { argon2idHash } from "@/lib/crypto/kdf";
import { generateTOTPSecret, encryptTOTPSecret, generateTOTPUri } from "@/lib/auth/totp";
import { appendAuditLog, AuditEventType } from "@/lib/audit/chain";

export async function GET(req: NextRequest) {
  try {
    const role = req.headers.get("x-user-role");
    if (role !== "admin" && role !== "hod") {
      return NextResponse.json({ error: "Access denied: Administrator privileges required" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        usn: true,
        email: true,
        name: true,
        role: true,
        isLocked: true,
        failedAttempts: true,
        lockedUntil: true,
        ed25519PubKey: true,
        ecdsaPubKey: true,
        createdAt: true,
      },
    });

    const sanitizedUsers = users.map((u) => ({
      ...u,
      hasEd25519Key: !!u.ed25519PubKey,
      hasECDSAKey: !!u.ecdsaPubKey,
      ed25519PubKey: undefined,
      ecdsaPubKey: undefined,
    }));

    return NextResponse.json({ users: sanitizedUsers });
  } catch (err) {
    console.error("[admin/users GET]", err);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");

    if (role !== "admin" && role !== "hod") {
      return NextResponse.json({ error: "Access denied: Administrator privileges required" }, { status: 403 });
    }

    const body = await req.json();
    const { usn, email, name, password, targetRole } = body;

    if (!usn || !email || !name || !password || !targetRole) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const allowedRoles = ["student", "examiner", "admin", "hod"];
    if (!allowedRoles.includes(targetRole)) {
      return NextResponse.json({ error: "Invalid user role specified" }, { status: 400 });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ usn: usn.toUpperCase() }, { email: email.toLowerCase() }],
      },
    });

    if (existingUser) {
      return NextResponse.json({ error: "A user with this USN or Email already exists" }, { status: 409 });
    }

    // Hash password with Argon2id
    const passwordHash = await argon2idHash(password);

    // Generate and encrypt TOTP secret
    const rawTotpSecret = generateTOTPSecret();
    const { secretBase32: totpBase32 } = rawTotpSecret;
    const encryptedTotpSecret = encryptTOTPSecret(totpBase32, usn.toUpperCase());

    const newUser = await prisma.user.create({
      data: {
        usn: usn.toUpperCase(),
        email: email.toLowerCase(),
        name,
        role: targetRole,
        passwordHash,
        totpSecret: encryptedTotpSecret,
      },
      select: {
        id: true,
        usn: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // Append tamper-evident audit log
    const auditPrivKey = process.env.AUDIT_ED25519_PRIVATE_KEY_PEM ?? "";
    await appendAuditLog(
      AuditEventType.USER_REGISTERED,
      adminId ?? undefined,
      undefined,
      {
        provisionedUserId: newUser.id,
        usn: newUser.usn,
        role: newUser.role,
        provisionedByAdmin: true,
      },
      auditPrivKey,
      req.headers.get("x-forwarded-for") ?? undefined
    ).catch((aErr) => {
      console.warn("[admin/users] Audit log append error:", aErr);
    });

    const totpUri = generateTOTPUri(newUser.usn, totpBase32);

    return NextResponse.json({
      message: "User provisioned successfully",
      user: newUser,
      totpSecret: totpBase32,
      totpUri,
    });
  } catch (err) {
    console.error("[admin/users POST]", err);
    return NextResponse.json({ error: "Failed to provision user" }, { status: 500 });
  }
}
