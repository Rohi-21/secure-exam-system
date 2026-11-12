/**
 * GET /api/exam/[id]/results
 * Delivers an individual student's result, re-encrypted over their active ECDH session.
 *
 * Flow:
 *   1. Validate student identity + session
 *   2. Fetch encrypted result from DB
 *   3. Decrypt result using ExamKEK (via cache)
 *   4. Verify examiner Ed25519 signature on result ciphertext hash
 *   5. Re-encrypt decrypted result with student's ECDH session key
 *   6. Return re-encrypted payload + examiner signature + Merkle inclusion proof
 *
 * Students also receive their Merkle inclusion proof so they can independently
 * verify their submission is in the final batch.
 *
 * Header: x-session-id — from the ECDH handshake
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { envelopeDecrypt } from "@/lib/crypto/envelope";
import { encryptAES256GCM } from "@/lib/crypto/aes";
import { ed25519Verify } from "@/lib/crypto/ed25519";
import { sha256Hex } from "@/lib/crypto/hash";
import { sessionKeyStore } from "../ecdh-handshake/route";
import { examKEKCache } from "../questions/route";
import type { EncryptionAAD } from "@/lib/crypto/aes";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = req.headers.get("x-user-id")!;
    const sessionId = req.headers.get("x-session-id") ?? req.nextUrl.searchParams.get("sessionId") ?? "";
    const { id: examId } = await params;

    // ── Validate ECDH session ─────────────────────────────────────────
    const session = sessionKeyStore.get(sessionId);
    if (!session || session.studentId !== studentId || session.examId !== examId) {
      return NextResponse.json(
        { error: "Invalid session. Perform ECDH handshake first." },
        { status: 401 }
      );
    }

    // ── Fetch result + its DEK ────────────────────────────────────────
    const result = await prisma.result.findFirst({
      where: { studentId, examId },
      include: { dek: true },
    });

    if (!result) {
      return NextResponse.json(
        { error: "Result not yet available. Check back after results are released." },
        { status: 404 }
      );
    }
    if (!result.releasedAt) {
      return NextResponse.json({ error: "Results have not been released yet." }, { status: 403 });
    }

    // ── Get ExamKEK ───────────────────────────────────────────────────
    const examKEK = examKEKCache.get(examId);
    if (!examKEK) {
      return NextResponse.json(
        { error: "Result decryption unavailable. Contact your examiner." },
        { status: 503 }
      );
    }

    // ── Decrypt result ────────────────────────────────────────────────
    const resultAAD: EncryptionAAD = {
      record_id: result.id,
      record_type: "result",
      exam_id: examId,
      user_id: studentId,
      key_version: result.keyVersion,
      algorithm: "AES-256-GCM",
    };

    const plainBuf = envelopeDecrypt(examKEK, {
      ciphertext: result.ciphertext,
      authTag: result.authTag,
      iv: result.iv,
      aad: result.aad,
      wrappedDEK: result.dek!.wrappedDEK,
      dekIv: result.dek!.dekIv,
      dekAuthTag: result.dek!.dekAuthTag,
    }, resultAAD, examId);

    // ── Verify examiner signature ─────────────────────────────────────
    const auditPubKey = process.env.AUDIT_ED25519_PUBLIC_KEY_PEM ?? "";
    const resultCipherHash = sha256Hex(Buffer.from(result.ciphertext, "base64"));
    const sigValid = auditPubKey
      ? ed25519Verify(auditPubKey, Buffer.from(resultCipherHash, "hex"), result.examinerSignature)
      : false;

    // ── Re-encrypt with student's ECDH session key ────────────────────
    const sessionAAD: EncryptionAAD = {
      record_id: `result-${sessionId}`,
      record_type: "result",
      exam_id: examId,
      user_id: studentId,
      key_version: 1,
      algorithm: "AES-256-GCM",
    };
    const sessionEncrypted = encryptAES256GCM(session.encKey, plainBuf, sessionAAD);

    // ── Fetch Merkle proof from submission ────────────────────────────
    const submission = await prisma.submission.findFirst({
      where: { studentId, examId },
      select: { merkleProof: true, contentHash: true, id: true },
    });

    return NextResponse.json({
      // Result — encrypted with student's session key (student decrypts in browser)
      result: {
        ciphertext: sessionEncrypted.ciphertext,
        authTag: sessionEncrypted.authTag,
        iv: sessionEncrypted.iv,
        aad: sessionEncrypted.aad,
      },
      // Proof of examiner endorsement
      examinerSignatureValid: sigValid,
      examinerSignature: result.examinerSignature,
      resultCipherHash,
      // Proof of batch inclusion
      merkleProof: submission?.merkleProof ? JSON.parse(submission.merkleProof) : null,
      merkleRoot: result.merkleRoot,
      submissionId: submission?.id,
      contentHash: submission?.contentHash,
    });

  } catch (err) {
    console.error("[results]", err);
    return NextResponse.json({ error: "Result delivery failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/exam/[id]/results
 * Examiner releases results (sets releasedAt timestamp).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    if (!["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.result.updateMany({
      where: { examId, releasedAt: null },
      data: { releasedAt: new Date() },
    });

    return NextResponse.json({
      message: `Released results for ${updated.count} student(s).`,
      count: updated.count,
    });
  } catch (err) {
    console.error("[results PATCH]", err);
    return NextResponse.json({ error: "Release failed" }, { status: 500 });
  }
}
