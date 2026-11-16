/**
 * POST /api/exam/[id]/ecdh-handshake
 * Establishes an application-layer session key between student and server.
 *
 * Purpose: Protects question paper delivery from passive TLS interception
 * by infrastructure components (reverse proxies, load balancers).
 *
 * Protocol:
 *   1. Client generates ephemeral ECDH-P256 key pair in browser (WebCrypto)
 *   2. Client sends its ephemeral public key + session request
 *   3. Server generates its own ephemeral ECDH-P256 key pair
 *   4. Server computes shared secret → derives {K_enc, K_auth, K_iv_seed} via HKDF
 *   5. Server signs { serverPubKey, clientPubKey, examId, sessionId, nonce, timestamp }
 *      with its long-term Ed25519 key — client can verify identity (trust via TLS cert)
 *   6. Server returns { serverEphemeralPubKey, signature, sessionId, nonce }
 *   7. Client verifies signature, computes same shared secret, derives same keys
 *   8. Session keys stored server-side in-process (never in DB)
 *
 * Body: { clientEphemeralPubKeyB64: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverHandshake } from "@/lib/crypto/ecdh";
import { ed25519Sign, buildHandshakePayload } from "@/lib/crypto/ed25519";
import { randomBytes } from "crypto";
import { sessionStore } from "@/lib/store/session-store";

// In-process session key store: sessionId → { encKey, authKey, ivSeed, studentId, examId }
// In production: use Redis with TTL = exam duration
export const sessionKeyStore = new Map<string, {
  encKey: Buffer;
  authKey: Buffer;
  ivSeed: Buffer;
  studentId: string;
  examId: string;
  expiresAt: number;
}>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const studentId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    if (role !== "student") {
      return NextResponse.json({ error: "Only students can initiate exam sessions" }, { status: 403 });
    }

    const { clientEphemeralPubKeyB64 } = await req.json();
    if (!clientEphemeralPubKeyB64) {
      return NextResponse.json({ error: "clientEphemeralPubKeyB64 required" }, { status: 400 });
    }

    // ── Validate exam is active and student is enrolled ───────────────
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    const now = new Date();
    if (exam.status !== "active" && exam.status !== "scheduled") {
      return NextResponse.json({ error: "Exam is not active" }, { status: 400 });
    }
    if (now < exam.startTime || now > exam.endTime) {
      return NextResponse.json({ error: "Exam window is not open" }, { status: 400 });
    }

    const enrollment = await prisma.examEnrollment.findUnique({
      where: { examId_studentId: { examId, studentId: studentId! } },
    });
    if (!enrollment) {
      return NextResponse.json({ error: "Not enrolled in this exam" }, { status: 403 });
    }

    // ── ECDH handshake ────────────────────────────────────────────────
    const sessionId = crypto.randomUUID();
    const nonce = randomBytes(32).toString("hex");
    const timestamp = Date.now();

    const { sessionKeys, serverEphemeralPubKeyB64 } = serverHandshake(
      clientEphemeralPubKeyB64,
      sessionId
    );

    // ── Sign the complete handshake transcript with server Ed25519 key ─
    const serverPrivKey = process.env.SERVER_ED25519_PRIVATE_KEY_PEM ?? "";
    const payloadBuf = buildHandshakePayload({
      serverEphemeralPubKeyB64,
      clientEphemeralPubKeyB64,
      examId,
      sessionId,
      nonce,
      timestamp,
      studentId: studentId!,
    });
    const signature = serverPrivKey
      ? ed25519Sign(serverPrivKey, payloadBuf)
      : "no-server-key-configured";

    // ── Store session keys in TTL-enforced store (never DB) ────────────
    const examDurationMs = exam.durationMins * 60 * 1000;
    const ttlMs = examDurationMs + 300_000; // duration + 5 min grace

    sessionKeyStore.set(sessionId, {
      encKey: sessionKeys.encKey,
      authKey: sessionKeys.authKey,
      ivSeed: sessionKeys.ivSeed,
      studentId: studentId!,
      examId,
      expiresAt: Date.now() + ttlMs,
    });

    sessionStore.setExamSession(
      sessionId,
      {
        encKey: sessionKeys.encKey,
        authKey: sessionKeys.authKey,
        ivSeed: sessionKeys.ivSeed,
        studentId: studentId!,
        examId,
      },
      ttlMs
    );

    // ── Create / update ExamSession in DB ─────────────────────────────
    const existingSession = await prisma.examSession.findUnique({
      where: { studentId_examId: { studentId: studentId!, examId } },
    });

    if (existingSession?.status === "submitted") {
      return NextResponse.json({ error: "Exam has already been submitted for this session" }, { status: 400 });
    }

    await prisma.examSession.upsert({
      where: { studentId_examId: { studentId: studentId!, examId } },
      create: {
        studentId: studentId!,
        examId,
        handshakeNonce: nonce,
        status: "active",
        startedAt: new Date(),
      },
      update: {
        handshakeNonce: nonce,
        // Preserve original startedAt timestamp so reconnects cannot prolong exam duration
      },
    });

    return NextResponse.json({
      sessionId,
      serverEphemeralPubKeyB64,
      signature,
      nonce,
      timestamp,
      examId,
      studentId: studentId!,
      serverEd25519PubKey: process.env.SERVER_ED25519_PUBLIC_KEY_PEM ?? "",
    });

  } catch (err) {
    console.error("[ecdh-handshake]", err);
    return NextResponse.json({ error: "Handshake failed" }, { status: 500 });
  }
}

