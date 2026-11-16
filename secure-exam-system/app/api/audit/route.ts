/**
 * Audit log API — append a new entry and anchor the chain head externally.
 *
 * POST /api/audit   — append a new audit event
 * GET  /api/audit   — read audit log (admin/hod only), optionally verify chain
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildAuditEntry, verifyAuditChain, AuditEventType } from "@/lib/audit/chain";

export async function POST(req: NextRequest) {
  try {
    const actorId = req.headers.get("x-user-id") ?? undefined;
    const role = req.headers.get("x-user-role") ?? "";

    if (!["admin", "hod", "examiner"].includes(role)) {
      return NextResponse.json({ error: "Forbidden: Authorized staff role required" }, { status: 403 });
    }

    const body = await req.json();
    const { eventType, examId, eventData } = body;
    if (!eventType || !eventData) {
      return NextResponse.json({ error: "eventType and eventData required" }, { status: 400 });
    }

    const auditPrivKey = process.env.AUDIT_ED25519_PRIVATE_KEY_PEM ?? "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

    const { appendAuditLog } = await import("@/lib/audit/chain");
    const entry = await appendAuditLog(
      eventType,
      actorId,
      examId,
      eventData,
      auditPrivKey,
      ip
    );

    return NextResponse.json({ sequenceNo: entry.sequenceNo, entryHash: entry.entryHash });
  } catch (err) {
    console.error("[audit POST]", err);
    return NextResponse.json({ error: "Audit log write failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const role = req.headers.get("x-user-role");
    const verify = req.nextUrl.searchParams.get("verify") === "true";

    if (!["admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const entries = await prisma.auditLog.findMany({
      orderBy: { sequenceNo: "asc" },
    });

    const formatted = entries.map((e) => ({
      sequenceNo: e.sequenceNo,
      eventType: e.eventType,
      actorId: e.actorId,
      examId: e.examId,
      eventData: JSON.parse(e.eventData),
      timestamp: e.timestamp.toISOString(), // AuditEntry.timestamp is string
      entryHash: e.entryHash,
      prevHash: e.prevHash,
      auditSig: e.auditSig,
    }));

    if (verify) {
      const auditPubKey = process.env.AUDIT_ED25519_PUBLIC_KEY_PEM ?? "";
      const { valid, firstInvalidIndex } = verifyAuditChain(
        formatted as Parameters<typeof verifyAuditChain>[0],
        auditPubKey
      );
      return NextResponse.json({ entries: formatted, chainValid: valid, firstInvalidIndex });
    }

    return NextResponse.json({ entries: formatted, total: entries.length });

  } catch (err) {
    console.error("[audit GET]", err);
    return NextResponse.json({ error: "Audit log read failed" }, { status: 500 });
  }
}
