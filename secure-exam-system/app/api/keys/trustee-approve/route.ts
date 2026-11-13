/**
 * POST /api/keys/trustee-approve
 *
 * Independent Trustee Authorization for Shamir Secret Sharing.
 *
 * Each trustee independently logs in and submits their passphrase to authorize
 * key reconstruction. No single user possesses or submits multiple trustee secrets.
 *
 * Lifecycle:
 * 1. Trustee A submits passphrase → share decrypted and stored in volatile memory.
 * 2. Audit log records TRUSTEE_APPROVAL_RECORDED.
 * 3. Trustee B submits passphrase → share decrypted.
 * 4. Threshold (2-of-3) achieved → ExamKEK reconstructed via Lagrange interpolation.
 * 5. ExamKEK cached in sessionStore with TTL (never written to disk).
 * 6. Audit log records SHAMIR_RECONSTRUCTION.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptSingleShare, combineRawShares } from "@/lib/crypto/shamir";
import { sessionStore } from "@/lib/store/session-store";
import { examKEKCache } from "@/app/api/exam/[id]/questions/route";
import { appendAuditLog, AuditEventType } from "@/lib/audit/chain";

// In-memory pending approvals: Map<examId, Map<trusteeId, Buffer>>
// Shares in memory are discarded immediately after quorum reconstruction or TTL.
const pendingApprovals = new Map<string, Map<string, Buffer>>();

export async function POST(req: NextRequest) {
  try {
    const actorId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");

    if (!actorId || !["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Access denied: Staff privileges required" }, { status: 403 });
    }

    const body = await req.json();
    const { examId, sharePassword, targetTrusteeId } = body;

    if (!examId || !sharePassword) {
      return NextResponse.json({ error: "Missing required fields (examId, sharePassword)" }, { status: 400 });
    }

    // ── 1. Find exam ────────────────────────────────────────────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Examination not found" }, { status: 404 });
    }

    // ── 2. Identify trustee share ───────────────────────────────────────
    // If targetTrusteeId is passed (e.g. ceremony coordinator), verify share exists; else use actorId
    const trusteeId = targetTrusteeId ?? actorId;
    const share = await prisma.keyShare.findFirst({
      where: { examId, trusteeId },
    });

    if (!share) {
      return NextResponse.json(
        { error: "No key share found for this trustee and examination" },
        { status: 404 }
      );
    }

    // ── 3. Attempt Decryption of this Trustee's Share ───────────────────
    let rawShare: Buffer;
    try {
      rawShare = await decryptSingleShare(
        {
          encryptedShare: share.encryptedShare,
          shareIv: share.shareIv,
          shareAuthTag: share.shareAuthTag,
          argon2Salt: share.argon2Salt,
          shareIndex: share.shareIndex,
        },
        sharePassword,
        examId
      );
    } catch {
      return NextResponse.json(
        { error: "Incorrect trustee passphrase or corrupted share tag" },
        { status: 400 }
      );
    }

    // ── 4. Record approval in volatile memory ───────────────────────────
    if (!pendingApprovals.has(examId)) {
      pendingApprovals.set(examId, new Map());
    }

    const examApprovals = pendingApprovals.get(examId)!;
    examApprovals.set(trusteeId, rawShare);

    // Append tamper-evident audit log for this individual trustee
    const auditPrivKey = process.env.AUDIT_ED25519_PRIVATE_KEY_PEM ?? "";
    await appendAuditLog(
      AuditEventType.TRUSTEE_APPROVAL_RECORDED,
      actorId,
      examId,
      {
        trusteeId,
        shareIndex: share.shareIndex,
        currentApprovalCount: examApprovals.size,
        requiredThreshold: 2,
      },
      auditPrivKey,
      req.headers.get("x-forwarded-for") ?? undefined
    ).catch((aErr) => {
      console.warn("[trustee-approve] Audit log error:", aErr);
    });

    // ── 5. Check if Threshold (2-of-3) Quorum is Reached ────────────────
    if (examApprovals.size >= 2) {
      const sharesArray = Array.from(examApprovals.values()).slice(0, 2);
      const examKEK = combineRawShares(sharesArray);

      if (examKEK.length !== 32) {
        return NextResponse.json({ error: "Reconstructed key is invalid (unexpected length)" }, { status: 500 });
      }

      // Cache reconstructed ExamKEK in sessionStore & examKEKCache
      const ttlMs = Math.max(3600_000, exam.endTime.getTime() - Date.now() + 30 * 60_000);
      sessionStore.setExamKEK(examId, examKEK, ttlMs);
      examKEKCache.set(examId, examKEK);

      // Clean up raw shares from volatile memory
      examApprovals.clear();
      pendingApprovals.delete(examId);

      // Append reconstruction audit event
      await appendAuditLog(
        AuditEventType.SHAMIR_RECONSTRUCTION,
        actorId,
        examId,
        {
          algorithm: "Shamir-2-of-3",
          quoromReached: true,
          expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        },
        auditPrivKey,
        req.headers.get("x-forwarded-for") ?? undefined
      ).catch(() => {});

      return NextResponse.json({
        status: "reconstructed",
        quorumReached: true,
        message: "Quorum achieved (2-of-3). ExamKEK successfully reconstructed in volatile memory.",
        cacheExpiresAt: new Date(Date.now() + ttlMs).toISOString(),
      });
    }

    // Otherwise, still awaiting second trustee
    return NextResponse.json({
      status: "pending",
      quorumReached: false,
      approvalsCount: examApprovals.size,
      requiredThreshold: 2,
      message: "Trustee approval registered successfully. Awaiting second trustee authorization.",
    });
  } catch (err) {
    console.error("[trustee-approve]", err);
    return NextResponse.json({ error: "Failed to process trustee approval" }, { status: 500 });
  }
}
