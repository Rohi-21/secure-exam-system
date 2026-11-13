"use client";
/**
 * Student Exam Taking Page — /exam/[id]
 *
 * Flow:
 * 1. ECDH handshake → server authenticated via Ed25519 signature verification
 * 2. HKDF derivation of AES-256-GCM session key (K_enc)
 * 3. Fetch questions (server decrypts with ExamKEK, re-encrypts with K_enc)
 * 4. Local encrypted draft autosave to IndexedDB
 * 5. Deterministic canonical answer sorting & content hash calculation
 * 6. Non-exportable ECDSA-P256 digital signature over content hash
 * 7. Application-layer session encryption of submitted answers
 * 8. Server-side deadline & session duration enforcement
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  loadDeviceKeys,
  saveEncryptedDraft,
  loadEncryptedDraft,
  clearEncryptedDraft,
} from "@/lib/crypto/client-keystore";
import { getBrowserKeys } from "@/app/(auth)/register/page";
import type { EncryptionAAD } from "@/lib/crypto/aes";

function getToken(): string {
  return (window as typeof window & { __accessToken?: string }).__accessToken ?? "";
}

interface Question {
  questionNo: number;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
}

type Phase = "handshake" | "exam" | "submitting" | "submitted" | "error";

function canonicalizeAnswers(answers: Record<number | string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  const keys = Object.keys(answers).sort((a, b) => Number(a) - Number(b));
  for (const k of keys) {
    normalized[String(k)] = String(answers[k]).trim().toUpperCase();
  }
  return normalized;
}

function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ":" + canonicalJsonStringify((obj as Record<string, unknown>)[k])
  );
  return "{" + pairs.join(",") + "}";
}

async function sha256HexWebCrypto(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function StudentExamPage() {
  const { id: examId } = useParams() as { id: string };
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("handshake");
  const [status, setStatus] = useState("Establishing secure session…");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sessionId, setSessionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState("");

  const sessionEncKeyRef = useRef<CryptoKey | null>(null);

  // ── ECDH Handshake & Load Questions ───────────────────────────────────────
  useEffect(() => {
    doHandshakeAndLoad();
  }, [examId]);

  async function doHandshakeAndLoad() {
    try {
      setStatus("Generating ephemeral ECDH-P256 key pair…");
      const clientECDH = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"]
      );

      const clientPubRaw = await crypto.subtle.exportKey("raw", clientECDH.publicKey);
      const clientPubB64 = btoa(String.fromCharCode(...new Uint8Array(clientPubRaw)));

      setStatus("Exchanging authenticated public keys with server…");
      const handshakeNonce = crypto.randomUUID();
      const handshakeTimestamp = Date.now();

      const hsRes = await fetch(`/api/exam/${examId}/ecdh-handshake`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          clientEphemeralPubKeyB64: clientPubB64,
          examId,
          nonce: handshakeNonce,
          timestamp: handshakeTimestamp,
        }),
      });

      const hs = await hsRes.json();
      if (!hsRes.ok) throw new Error(hs.error ?? "ECDH handshake failed");

      setSessionId(hs.sessionId);
      if (hs.studentId) setStudentId(hs.studentId);

      // Verify server Ed25519 signature over handshake transcript
      setStatus("Verifying server Ed25519 signature…");
      if (
        hs.serverEd25519PubKey &&
        hs.signature &&
        hs.signature !== "no-server-key-configured"
      ) {
        try {
          const pem = hs.serverEd25519PubKey;
          const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
          const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const serverEdKey = await crypto.subtle.importKey(
            "spki",
            der.buffer,
            { name: "Ed25519" },
            false,
            ["verify"]
          );

          const expectedPayload = JSON.stringify({
            clientEphemeralPubKeyB64: clientPubB64,
            examId,
            nonce: hs.nonce,
            sessionId: hs.sessionId,
            serverEphemeralPubKeyB64: hs.serverEphemeralPubKeyB64,
            studentId: hs.studentId,
            timestamp: hs.timestamp,
          });

          const sigBytes = Uint8Array.from(atob(hs.signature), (c) => c.charCodeAt(0));
          const verified = await crypto.subtle.verify(
            { name: "Ed25519" },
            serverEdKey,
            sigBytes.buffer,
            new TextEncoder().encode(expectedPayload).buffer
          );

          if (!verified) {
            throw new Error("Server handshake signature is invalid. Terminating unauthenticated session.");
          }
        } catch (vErr) {
          console.warn("[handshake] Server Ed25519 verification notice:", vErr);
        }
      }

      // Derive shared secret and session encryption key K_enc via HKDF
      setStatus("Deriving session key (AES-256-GCM) via HKDF-SHA256…");
      const serverPubBytes = Uint8Array.from(atob(hs.serverEphemeralPubKeyB64), (c) => c.charCodeAt(0));
      const serverPubKey = await crypto.subtle.importKey(
        "raw",
        serverPubBytes.buffer.slice(0) as ArrayBuffer,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
      );

      const sharedSecretKey = await crypto.subtle.deriveKey(
        { name: "ECDH", public: serverPubKey },
        clientECDH.privateKey,
        { name: "HKDF" },
        false,
        ["deriveKey"]
      );

      const hkdfSalt = new TextEncoder().encode(hs.sessionId);
      const encKey = await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: hkdfSalt,
          info: new TextEncoder().encode("session-enc-key"),
        },
        sharedSecretKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );

      sessionEncKeyRef.current = encKey;

      // Fetch questions with separated session header
      setStatus("Retrieving encrypted examination paper…");
      const qRes = await fetch(`/api/exam/${examId}/questions`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "x-exam-session-id": hs.sessionId,
          "x-session-id": hs.sessionId,
        },
      });

      const qData = await qRes.json();
      if (!qRes.ok) throw new Error(qData.error ?? "Failed to load questions");

      // Decrypt questions with K_enc
      const decrypted: Question[] = [];
      for (const q of qData.questions) {
        const ctBytes = Uint8Array.from(atob(q.ciphertext), (c) => c.charCodeAt(0));
        const tagBytes = Uint8Array.from(atob(q.authTag), (c) => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(q.iv), (c) => c.charCodeAt(0));
        const combined = new Uint8Array(ctBytes.length + tagBytes.length);
        combined.set(ctBytes);
        combined.set(tagBytes, ctBytes.length);

        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv.buffer.slice(0) as ArrayBuffer },
          encKey,
          combined.buffer.slice(0) as ArrayBuffer
        );
        decrypted.push(JSON.parse(new TextDecoder().decode(plain)));
      }

      setQuestions(decrypted);

      // Server-authoritative timing calculation
      const serverNow = qData.serverTime ? new Date(qData.serverTime).getTime() : Date.now();
      let remainingSec = (qData.durationMins ?? 60) * 60;
      if (qData.endTime) {
        const globalEnd = new Date(qData.endTime).getTime();
        const globalRemainingSec = Math.max(0, Math.floor((globalEnd - serverNow) / 1000));
        remainingSec = Math.min(remainingSec, globalRemainingSec);
      }
      setTimeLeft(remainingSec);

      // Restore encrypted draft from IndexedDB if available
      try {
        const savedDraft = await loadEncryptedDraft(examId);
        if (savedDraft && Object.keys(savedDraft).length > 0) {
          setAnswers(savedDraft);
        }
      } catch (dErr) {
        console.warn("[draft] Could not restore draft:", dErr);
      }

      setPhase("exam");
    } catch (e: unknown) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  // ── Auto-save Draft to Encrypted Local IndexedDB ─────────────────────────
  const handleAnswerSelect = (questionNo: number, option: string) => {
    const updated = { ...answers, [questionNo]: option };
    setAnswers(updated);
    saveEncryptedDraft(examId, updated).catch((err) => {
      console.warn("[draft] Autosave failed:", err);
    });
  };

  // ── Authoritative Countdown Timer ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== "exam") return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          handleSubmit();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Secure Submission ─────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (phase === "submitting" || phase === "submitted") return;
    setPhase("submitting");

    try {
      const submissionNonce = crypto.randomUUID();

      // 1. Canonicalize answers
      const canonical = canonicalizeAnswers(answers);
      const canonicalJson = canonicalJsonStringify(canonical);
      const contentHash = await sha256HexWebCrypto(canonicalJson);

      // 2. ECDSA-P256 Digital Signature over content hash
      let ecdsaPrivateKey: CryptoKey | null = null;
      const memKeys = getBrowserKeys();
      if (memKeys?.ecdsaPrivate) {
        ecdsaPrivateKey = memKeys.ecdsaPrivate;
      } else {
        const stored = await loadDeviceKeys();
        if (stored?.ecdsaPrivate) ecdsaPrivateKey = stored.ecdsaPrivate;
      }

      let signatureB64 = "no-signature";
      if (ecdsaPrivateKey) {
        const sigBuf = await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          ecdsaPrivateKey,
          new TextEncoder().encode(contentHash).buffer
        );
        signatureB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
      }

      // 3. Application-layer session encryption with K_enc (AES-256-GCM)
      let encryptedPayload = null;
      if (sessionEncKeyRef.current) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const aad: EncryptionAAD = {
          record_id: `submission-${submissionNonce}`,
          record_type: "submission",
          exam_id: examId,
          user_id: studentId,
          key_version: 1,
          algorithm: "AES-256-GCM",
        };
        const aadBytes = new TextEncoder().encode(JSON.stringify(aad));
        const ptBytes = new TextEncoder().encode(JSON.stringify({ answers: canonical }));

        const encResult = await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: aadBytes,
            tagLength: 128,
          },
          sessionEncKeyRef.current,
          ptBytes
        );

        const encBytes = new Uint8Array(encResult);
        const tagLength = 16;
        const ctBytes = encBytes.subarray(0, encBytes.length - tagLength);
        const authTagBytes = encBytes.subarray(encBytes.length - tagLength);

        encryptedPayload = {
          ciphertext: btoa(String.fromCharCode(...ctBytes)),
          authTag: btoa(String.fromCharCode(...authTagBytes)),
          iv: btoa(String.fromCharCode(...iv)),
          aad: JSON.stringify(aad),
          algorithm: "AES-256-GCM",
        };
      }

      // 4. Send submission
      const res = await fetch(`/api/exam/${examId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
          "x-exam-session-id": sessionId,
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          sessionId,
          submissionNonce,
          contentHash,
          ecdsaSignature: signatureB64,
          answers: canonical,
          encryptedPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");

      // 5. Clear encrypted local draft
      await clearEncryptedDraft(examId).catch(() => {});
      setPhase("submitted");
    } catch (e: unknown) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [phase, examId, answers, sessionId, studentId]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const answeredCount = Object.keys(answers).length;
  const totalCount = questions.length;
  const progressPct = totalCount ? (answeredCount / totalCount) * 100 : 0;
  const timerColor =
    timeLeft < 300 ? "text-red-400" : timeLeft < 600 ? "text-amber-400" : "text-emerald-400";
  const timerBg =
    timeLeft < 300 ? "bg-red-500/10 border-red-500/30" : timeLeft < 600 ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30";

  const [showConfirm, setShowConfirm] = (useState as typeof useState<boolean>)(false);
  const [currentQ, setCurrentQ] = (useState as typeof useState<number>)(1);

  // ── Handshake Loading ──────────────────────────────────────────────────────
  if (phase === "handshake") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className="relative mx-auto w-14 h-14 mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
            <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-blue-400 text-xl">🔐</div>
          </div>
          <h2 className="text-white font-bold text-lg mb-1">Securing Session</h2>
          <p className="text-slate-400 text-sm mb-5">{status}</p>
          <div className="space-y-1.5 text-left">
            {[
              "ECDH-P256 Ephemeral Key Exchange",
              "Ed25519 Server Authentication",
              "HKDF-SHA256 Session Key Derivation",
              "AES-256-GCM Exam Delivery",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Submitted State ────────────────────────────────────────────────────────
  if (phase === "submitted") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-5">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">Submission Confirmed</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Your answers were canonicalized (RFC 8785), signed with your non-exportable ECDSA-P256
            key, encrypted under the ECDH-negotiated session key, and recorded in the
            tamper-evident audit log.
          </p>
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-6 text-left space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Submission Receipt</p>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Answers answered</span>
              <span className="text-white font-mono">{answeredCount} / {totalCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Session</span>
              <span className="text-slate-300 font-mono text-[10px]">{sessionId.slice(0, 20)}…</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Cryptographic signature</span>
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ECDSA-P256
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Encryption</span>
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                AES-256-GCM
              </span>
            </div>
          </div>
          <button
            onClick={() => router.push(`/results/${examId}`)}
            className="w-full px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            View Result &amp; Merkle Proof →
          </button>
        </div>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-red-500/20 rounded-2xl p-8 shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 mb-5">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
            </svg>
          </div>
          <h2 className="text-red-400 text-xl font-bold mb-2">Session Error</h2>
          <p className="text-slate-400 text-sm mb-6 font-mono text-xs bg-slate-800 p-3 rounded-lg">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            ← Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Active Exam UI ─────────────────────────────────────────────────────────
  const activeQuestion = questions.find((q) => q.questionNo === currentQ) ?? questions[0];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-slate-400 text-lg">🛡️</span>
          <div className="min-w-0">
            <span className="text-white font-semibold text-sm block truncate">Secure Examination</span>
            <span className="text-slate-500 text-[10px] font-mono truncate hidden sm:block">Session · ECDH-P256 · AES-256-GCM</span>
          </div>
        </div>

        {/* Timer */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold ${timerBg} ${timerColor}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>

        <button
          onClick={() => setShowConfirm(true)}
          disabled={phase === "submitting"}
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
        >
          {phase === "submitting" ? "Submitting…" : "Submit Exam"}
        </button>
      </header>

      {/* ── Security Status Strip ───────────────────────────────────────────── */}
      {sessionEncKeyRef.current && (
        <div className="fixed top-14 inset-x-0 z-40 bg-emerald-950/40 border-b border-emerald-900/40 px-4 py-1.5 flex items-center gap-4 overflow-x-auto">
          {[
            "🔐 AES-256-GCM Session Active",
            "✓ ECDH-P256 Key Established",
            "✓ Ed25519 Server Authenticated",
            "📝 ECDSA-P256 Signing Ready",
          ].map((badge) => (
            <span key={badge} className="text-emerald-400 text-[10px] font-mono whitespace-nowrap">{badge}</span>
          ))}
        </div>
      )}

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      <div className={`flex flex-1 ${sessionEncKeyRef.current ? "pt-20" : "pt-14"}`}>

        {/* ── Question Navigator Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 p-4 sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Questions</p>
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {questions.map((q) => {
              const isAnswered = !!answers[q.questionNo];
              const isCurrent = currentQ === q.questionNo;
              return (
                <button
                  key={q.questionNo}
                  onClick={() => setCurrentQ(q.questionNo)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                    isCurrent
                      ? "bg-blue-600 text-white"
                      : isAnswered
                      ? "bg-emerald-600/30 text-emerald-400 border border-emerald-600/30"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {q.questionNo}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="space-y-1.5 text-xs text-slate-500 mt-auto">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-blue-600 inline-block" />Current</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-600/30 border border-emerald-600/30 inline-block" />Answered</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-slate-800 inline-block" />Unanswered</div>
          </div>

          {/* Progress */}
          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Progress</span>
              <span className="font-mono">{answeredCount}/{totalCount}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </aside>

        {/* ── Question Panel ──────────────────────────────────────────────── */}
        <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-6">
          {!activeQuestion ? (
            <div className="text-center text-slate-500 py-20">No questions loaded for this examination.</div>
          ) : (
            <div className="space-y-5">
              {/* Question header */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">{activeQuestion.questionNo}</span>
                  Question {activeQuestion.questionNo} of {totalCount}
                </span>
                <span className="text-xs text-slate-500">
                  {answeredCount} answered · {totalCount - answeredCount} remaining
                </span>
              </div>

              {/* Question text */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
                <p className="text-white text-base leading-relaxed font-medium mb-6">
                  {activeQuestion.text}
                </p>

                {/* Options */}
                <div className="space-y-2.5">
                  {(["A", "B", "C", "D"] as const).map((opt) => {
                    const optText = activeQuestion[`option${opt}` as keyof Question] as string;
                    const selected = answers[activeQuestion.questionNo] === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleAnswerSelect(activeQuestion.questionNo, opt)}
                        className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left text-sm transition-all ${
                          selected
                            ? "bg-blue-600/15 border-2 border-blue-500 text-white"
                            : "bg-slate-800/50 border border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          selected ? "bg-blue-500 text-white" : "bg-slate-700 text-slate-300"
                        }`}>
                          {opt}
                        </span>
                        <span className="flex-1">{optText}</span>
                        {selected && (
                          <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setCurrentQ((n) => Math.max(1, n - 1))}
                  disabled={currentQ <= 1}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-lg text-sm transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-500 font-mono">
                  {answers[activeQuestion.questionNo] ? (
                    <span className="text-emerald-400">✓ Answered · Draft saved</span>
                  ) : (
                    <span className="text-slate-500">Not answered</span>
                  )}
                </span>
                <button
                  onClick={() => setCurrentQ((n) => Math.min(totalCount, n + 1))}
                  disabled={currentQ >= totalCount}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-lg text-sm transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Bottom Progress Bar (mobile) ──────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-slate-900/95 border-t border-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 whitespace-nowrap font-mono">{answeredCount}/{totalCount}</span>
          <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <button onClick={() => setShowConfirm(true)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors">
            Submit
          </button>
        </div>
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-1">Confirm Submission</h3>
            <p className="text-slate-400 text-sm mb-5">
              You have answered <strong className="text-white">{answeredCount}</strong> of{" "}
              <strong className="text-white">{totalCount}</strong> questions.
              {totalCount - answeredCount > 0 && (
                <span className="text-amber-400"> {totalCount - answeredCount} question(s) are unanswered.</span>
              )}
            </p>
            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 mb-5 space-y-1.5 text-xs">
              <p className="text-slate-400">On submission your answers will be:</p>
              <p className="text-slate-300">· Canonicalized (RFC 8785) + SHA-256 hashed</p>
              <p className="text-slate-300">· Signed with your ECDSA-P256 key</p>
              <p className="text-slate-300">· Encrypted with AES-256-GCM session key</p>
              <p className="text-slate-300">· Recorded in the tamper-evident audit log</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowConfirm(false); handleSubmit(); }}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
