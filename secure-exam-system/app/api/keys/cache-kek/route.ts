/**
 * POST /api/keys/cache-kek
 * Alternative KEK injection path using examiner's RSA private key.
 *
 * The examiner RSA-unwraps the ExamKEK in their browser using their private key
 * (which never leaves the browser), then sends the raw ExamKEK over HTTPS to be
 * cached server-side for question delivery.
 *
 * This is the backup path when Shamir ceremony is impractical at exam start.
 * Shamir reconstruction (/api/keys/reconstruct) is the primary institutional path.
 *
 * Body: { examId: string, examKEKb64: string }  — KEK must be 32 bytes, base64
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { examKEKCache } from "@/app/api/exam/[id]/questions/route";

export async function POST(req: NextRequest) {
  try {
    const examinerId = req.headers.get("x-user-id")!;
    const role = req.headers.get("x-user-role");

    if (!["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { examId, examKEKb64 } = await req.json();
    if (!examId || !examKEKb64) {
      return NextResponse.json({ error: "examId and examKEKb64 required" }, { status: 400 });
    }

    // ── Verify exam ownership ─────────────────────────────────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.createdById !== examinerId) {
      return NextResponse.json({ error: "Exam not found or not owned by you" }, { status: 404 });
    }

    const examKEK = Buffer.from(examKEKb64, "base64");
    if (examKEK.length !== 32) {
      return NextResponse.json({ error: "Invalid ExamKEK — must be 32 bytes" }, { status: 400 });
    }

    // ── Cache with TTL ────────────────────────────────────────────────
    const cacheTTL = Math.max(exam.endTime.getTime() - Date.now() + 30 * 60 * 1000, 0);
    examKEKCache.set(examId, examKEK);
    if (cacheTTL > 0) setTimeout(() => examKEKCache.delete(examId), cacheTTL);

    return NextResponse.json({
      message: "ExamKEK cached. Exam questions can now be delivered.",
      cacheExpiresAt: new Date(Date.now() + cacheTTL).toISOString(),
    });

  } catch (err) {
    console.error("[cache-kek]", err);
    return NextResponse.json({ error: "KEK caching failed" }, { status: 500 });
  }
}
