/**
 * POST /api/exam/[id]/finalize
 * Builds a SHA-256 Merkle tree over all submissions.
 *
 * Merkle root provides cryptographic proof that the set of accepted submissions
 * is fixed. Each student can verify their submission is included via their
 * individual inclusion proof (MerkleProof).
 *
 * Leaves are ordered by studentId (lexicographic) for determinism.
 * Leaf data = SHA-256(submissionId + contentHash + studentId)
 *
 * Run AFTER exam closes and BEFORE releasing results.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildMerkleTree, generateMerkleProof } from "@/lib/crypto/merkle";
import { appendAuditLog, AuditEventType } from "@/lib/audit/chain";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    if (!["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Fetch all submissions (sorted deterministically by studentId) ──
    const submissions = await prisma.submission.findMany({
      where: { examId },
      orderBy: { studentId: "asc" },
    });

    if (submissions.length === 0) {
      return NextResponse.json({ error: "No submissions found" }, { status: 404 });
    }

    // ── Build leaf data: submissionId|contentHash|studentId ───────────
    const leaves = submissions.map(
      (s) => `${s.id}|${s.contentHash}|${s.studentId}`
    );

    const { root: merkleRoot, leafHashes } = buildMerkleTree(leaves);

    // ── Generate and store inclusion proof for each submission ─────────
    const updateOps = submissions.map((sub, idx) => {
      const proof = generateMerkleProof(leaves, idx);
      return prisma.submission.update({
        where: { id: sub.id },
        data: { merkleProof: JSON.stringify(proof) },
      });
    });

    await prisma.$transaction(updateOps);

    // Store Merkle root on each result and release results to candidates
    await prisma.result.updateMany({
      where: { examId },
      data: {
        merkleRoot,
        releasedAt: new Date(),
      },
    });

    // Mark exam as finalized
    await prisma.exam.update({
      where: { id: examId },
      data: { status: "finalized" },
    });

    // Append tamper-evident audit log
    const auditPrivKey = process.env.AUDIT_ED25519_PRIVATE_KEY_PEM ?? "";
    await appendAuditLog(
      AuditEventType.RESULT_FINALIZED,
      req.headers.get("x-user-id") ?? undefined,
      examId,
      {
        merkleRoot,
        submissionCount: submissions.length,
        leavesSummary: leafHashes.slice(0, 3),
      },
      auditPrivKey,
      req.headers.get("x-forwarded-for") ?? undefined
    ).catch(() => {});

    return NextResponse.json({
      message: "Merkle tree built. Inclusion proofs stored and results released for all submissions.",
      merkleRoot,
      submissionCount: submissions.length,
      leafHashes: leafHashes.slice(0, 5), // Preview first 5
    });

  } catch (err) {
    console.error("[finalize]", err);
    return NextResponse.json({ error: "Merkle finalization failed" }, { status: 500 });
  }
}
