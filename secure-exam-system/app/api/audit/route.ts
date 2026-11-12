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
    const body = await req.json();

    const { eventType, examId, resourceType, resourceId, eventData } = body;
    if (!eventType || !eventData) {
      return NextResponse.json({ error: "eventType and eventData required" }, { status: 400 });
    }

    const auditPrivKey = process.env.AUDIT_ED25519_PRIVATE_KEY_PEM ?? "";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

    // ── Get last entry for chain linkage ──────────────────────────────
    const lastEntry = await prisma.auditLog.findFirst({
      orderBy: { sequenceNo: "desc" },
      select: { sequenceNo: true, entryHash: true },
    });

    const prevHash = lastEntry?.entryHash ?? "0".repeat(64);
    const sequenceNo = (lastEntry?.sequenceNo ?? 0) + 1;

    // ── Build signed audit entry ──────────────────────────────────────
    const entry = buildAuditEntry(prevHash, sequenceNo, {
      eventType,
      actorId,
      examId,
      resourceType,
      resourceId,
      ipAddress: ip,
      eventData,
    }, auditPrivKey);

    // ── Persist ───────────────────────────────────────────────────────
    const created = await prisma.auditLog.create({
      data: {
        sequenceNo: entry.sequenceNo,
        eventType: entry.eventType,
        actorId: entry.actorId ?? null,
        examId: entry.examId ?? null,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.ipAddress ?? null,
        eventData: JSON.stringify(entry.eventData),
        timestamp: new Date(entry.timestamp),
        prevHash: entry.prevHash,
        entryHash: entry.entryHash,
        auditSig: entry.auditSig,
      },
    });

    return NextResponse.json({ sequenceNo: created.sequenceNo, entryHash: created.entryHash });

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
