/**
 * POST /api/exam/create
 * Examiner creates a new exam. The ExamKEK is generated here, then:
 *   1. Split into 3 Shamir shares (2-of-3 threshold), each encrypted with a trustee password
 *   2. RSA-OAEP wrapped with the examiner's stored public key (backup path)
 *   3. ExamKEK discarded from memory — never stored in plaintext
 *
 * Body: {
 *   title, description, startTime, endTime, durationMins,
 *   trusteePasswords: [pw1, pw2, pw3],  // 3 trustee passwords for Shamir shares
 *   trusteeIds: [uid1, uid2, uid3]      // 3 user IDs who will hold the shares
 * }
 *
 * Caller must be role: examiner | admin | hod (enforced by middleware)
 * Examiner must have an RSA key registered (ExaminerKey table)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateExamKEK, splitAndEncryptKEK } from "@/lib/crypto/shamir";
import { rsaWrapKey } from "@/lib/crypto/rsa";

export async function POST(req: NextRequest) {
  try {
    const examinerId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");

    if (!examinerId || !["examiner", "admin", "hod"].includes(role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, startTime, endTime, durationMins, trusteePasswords, trusteeIds } = body;

    // ── Validate inputs ───────────────────────────────────────────────
    if (!title || !startTime || !endTime || !durationMins) {
      return NextResponse.json({ error: "Missing required exam fields" }, { status: 400 });
    }
    if (!Array.isArray(trusteePasswords) || trusteePasswords.length !== 3) {
      return NextResponse.json({ error: "Exactly 3 trustee passwords required for Shamir 2-of-3" }, { status: 400 });
    }
    if (!Array.isArray(trusteeIds) || trusteeIds.length !== 3) {
      return NextResponse.json({ error: "Exactly 3 trustee user IDs required" }, { status: 400 });
    }
    if (new Date(startTime) >= new Date(endTime)) {
      return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
    }

    // ── Verify examiner has an RSA key ────────────────────────────────
    const examinerKey = await prisma.examinerKey.findUnique({ where: { examinerId } });
    if (!examinerKey) {
      return NextResponse.json(
        { error: "No RSA public key on file. Please register your examiner key first." },
        { status: 400 }
      );
    }

    // ── Generate ExamKEK — 32 random bytes, never stored plaintext ────
    const examKEK = generateExamKEK();

    // ── Shamir 2-of-3 split, encrypt each share with trustee password ─
    const encryptedShares = await splitAndEncryptKEK(
      examKEK,
      "pending", // exam ID not yet known; we'll update after DB insert
      trusteePasswords as [string, string, string]
    );

    // ── RSA-OAEP wrap of ExamKEK with examiner public key (backup) ────
    const wrappedKEKRSA = rsaWrapKey(examinerKey.rsaPublicKey, examKEK);

    // ── Create exam record ────────────────────────────────────────────
    const exam = await prisma.exam.create({
      data: {
        title,
        description: description ?? "",
        createdById: examinerId,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        durationMins,
        status: "draft",
      },
    });

    // ── Re-encrypt shares now that we have the real exam ID ───────────
    const finalShares = await splitAndEncryptKEK(
      examKEK,
      exam.id,
      trusteePasswords as [string, string, string]
    );

    // ── Verify all trustee IDs exist ──────────────────────────────────
    const trustees = await prisma.user.findMany({
      where: { id: { in: trusteeIds } },
      select: { id: true },
    });
    if (trustees.length !== 3) {
      await prisma.exam.delete({ where: { id: exam.id } });
      return NextResponse.json({ error: "One or more trustee user IDs not found" }, { status: 400 });
    }

    // ── Store Shamir shares + RSA-wrapped KEK in DB ───────────────────
    await prisma.$transaction([
      prisma.examKEKMetadata.create({
        data: {
          examId: exam.id,
          examinerKeyId: examinerKey.id,
          wrappedKEKRSA,
          algorithm: "RSA-OAEP-SHA256",
          keyVersion: 1,
        },
      }),
      ...finalShares.map((share, i) =>
        prisma.keyShare.create({
          data: {
            examId: exam.id,
            trusteeId: trusteeIds[i],
            encryptedShare: share.encryptedShare,
            shareIv: share.shareIv,
            shareAuthTag: share.shareAuthTag,
            argon2Salt: share.argon2Salt,
            shareIndex: share.shareIndex,
            threshold: 2,
            totalShares: 3,
          },
        })
      ),
    ]);

    // ExamKEK goes out of scope here — no plaintext stored anywhere
    return NextResponse.json({
      message: "Exam created. ExamKEK split and secured.",
      examId: exam.id,
      status: "draft",
    }, { status: 201 });

  } catch (err) {
    console.error("[exam/create]", err);
    return NextResponse.json({ error: "Exam creation failed" }, { status: 500 });
  }
}
