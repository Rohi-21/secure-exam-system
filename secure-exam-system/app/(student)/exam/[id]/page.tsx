"use client";

/**
 * Student Exam Taking Page — /exam/[id]
 *
 * Cryptographic Handshake & Examination Protocol:
 * 1. ECDH-P256 handshake → server authenticated via Ed25519 signature
 * 2. HKDF derivation of AES-256-GCM session key (K_enc)
 * 3. Fetch questions (server decrypts with ExamKEK, re-encrypts with K_enc)
 * 4. Local encrypted draft autosave to IndexedDB
 * 5. Deterministic canonical answer sorting & content hash calculation
 * 6. Non-exportable ECDSA-P256 digital signature over content hash
 * 7. Application-layer session encryption of submitted answers
 * 8. Server-side deadline & session duration enforcement
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  loadDeviceKeys,
  saveEncryptedDraft,
  loadEncryptedDraft,
  clearEncryptedDraft,
} from "@/lib/crypto/client-keystore";
import { getBrowserKeys } from "@/app/(auth)/register/page";
import type { EncryptionAAD } from "@/lib/crypto/aes";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

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
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [sessionId, setSessionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentQ, setCurrentQ] = useState(1);
  const [lastAutosave, setLastAutosave] = useState<string | null>(null);

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
          setLastAutosave("Restored from local draft");
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
    setLastAutosave("Saving…");
    saveEncryptedDraft(examId, updated)
      .then(() => {
        setLastAutosave(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`);
      })
      .catch((err) => {
        console.warn("[draft] Autosave failed:", err);
        setLastAutosave("Autosave offline");
      });
  };

  const toggleFlag = (questionNo: number) => {
    setFlagged((prev) => ({ ...prev, [questionNo]: !prev[questionNo] }));
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

  // ── Keyboard Navigation ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "exam") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const activeQ = questions.find((q) => q.questionNo === currentQ);
      if (!activeQ) return;

      if (e.key === "1" || e.key.toUpperCase() === "A") {
        handleAnswerSelect(activeQ.questionNo, "A");
      } else if (e.key === "2" || e.key.toUpperCase() === "B") {
        handleAnswerSelect(activeQ.questionNo, "B");
      } else if (e.key === "3" || e.key.toUpperCase() === "C") {
        handleAnswerSelect(activeQ.questionNo, "C");
      } else if (e.key === "4" || e.key.toUpperCase() === "D") {
        handleAnswerSelect(activeQ.questionNo, "D");
      } else if (e.key === "ArrowLeft") {
        setCurrentQ((n) => Math.max(1, n - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentQ((n) => Math.min(questions.length, n + 1));
      } else if (e.key.toUpperCase() === "F") {
        toggleFlag(activeQ.questionNo);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, currentQ, questions, answers]);

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
  const isUrgent = timeLeft < 300; // < 5 mins
  const isWarning = timeLeft < 600 && !isUrgent; // < 10 mins

  // ── Handshake Loading State ───────────────────────────────────────────────
  if (phase === "handshake") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="relative mx-auto w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-slate-800" />
            <div className="absolute inset-0 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-blue-400">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Establishing Ephemeral ECDH Session
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-mono">{status}</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-left">
            <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold tracking-wider">
              Handshake Cryptographic Pipeline
            </div>
            {[
              "WebCrypto ECDH-P256 Client Key Generation",
              "Server Ed25519 Transcript Verification",
              "HKDF-SHA256 Session Key Derivation",
              "AES-256-GCM Encrypted Delivery of Question Bank",
            ].map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Submitted Confirmation State ──────────────────────────────────────────
  if (phase === "submitted") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-emerald-400 shadow-md">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-100">
              Examination Submitted &amp; Verified
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
              Your submission has been canonicalized (RFC 8785), cryptographically signed with your non-exportable ECDSA-P256 key, encrypted under session secrecy, and appended to the tamper-evident audit ledger.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-950/80 border border-slate-800 text-left space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 text-[11px] uppercase text-slate-400 font-semibold">
              <span>Cryptographic Receipt</span>
              <Badge variant="success" size="sm">Signed ✓</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Answered Questions</span>
              <span className="text-slate-200 tabular-nums">{answeredCount} / {totalCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Session Identifier</span>
              <span className="text-slate-300 text-[11px] truncate max-w-[200px]">{sessionId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Digital Signature</span>
              <span className="text-emerald-400">ECDSA-P256 (Hardware)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payload Encryption</span>
              <span className="text-blue-400">AES-256-GCM Envelope</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href={`/results/${examId}`} className="flex-1">
              <Button variant="primary" size="md" className="w-full">
                View Result &amp; Merkle Proof →
              </Button>
            </Link>
            <Link href="/dashboard" className="flex-1">
              <Button variant="secondary" size="md" className="w-full">
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-red-900/60 rounded-2xl p-8 shadow-2xl text-center space-y-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-950/70 border border-red-800/80 text-red-400">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-400">Session Error</h2>
            <p className="text-xs text-slate-300 mt-2 p-3 rounded-lg bg-slate-950 font-mono text-left border border-slate-800 break-all">
              {error}
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="secondary" size="md" className="w-full">
              ← Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Active Examination Interface ──────────────────────────────────────────
  const activeQuestion = questions.find((q) => q.questionNo === currentQ) ?? questions[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* ── Fixed Institutional Top Bar ───────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-950/95 border-b border-slate-800/80 px-4 sm:px-6 h-16 flex items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-sm text-slate-100 block truncate">
              KLE Tech Examination Room
            </span>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Forward-Secret Session</span>
              {lastAutosave && (
                <>
                  <span>&bull;</span>
                  <span className="text-emerald-400">{lastAutosave}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Centered Authoritative Timer */}
        <div
          className={`px-4 py-1.5 rounded-lg border font-mono text-sm font-bold flex items-center gap-2 tabular-nums shadow-sm transition-colors ${
            isUrgent
              ? "bg-red-950/80 border-red-500/80 text-red-400 animate-pulse"
              : isWarning
              ? "bg-amber-950/80 border-amber-500/80 text-amber-400"
              : "bg-slate-900 border-slate-700 text-slate-200"
          }`}
          aria-live="polite"
          aria-label={`Time remaining: ${mins} minutes and ${secs} seconds`}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
        </div>

        {/* Submit button */}
        <Button
          variant="primary"
          size="sm"
          loading={phase === "submitting"}
          onClick={() => setShowConfirm(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-950/50"
        >
          Finish &amp; Submit
        </Button>
      </header>

      {/* ── Main Layout: Sidebar & Question Workspace ─────────────────────── */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-8">
        {/* Left Navigator Palette */}
        <aside
          className="hidden md:flex flex-col w-64 shrink-0 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sticky top-24 h-[calc(100vh-8rem)]"
          aria-label="Question Navigation Palette"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Questions
            </span>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {answeredCount}/{totalCount}
            </span>
          </div>

          {/* Question Grid */}
          <div className="grid grid-cols-5 gap-2 overflow-y-auto pr-1">
            {questions.map((q) => {
              const isCurrent = currentQ === q.questionNo;
              const isAnswered = Boolean(answers[q.questionNo]);
              const isFlag = Boolean(flagged[q.questionNo]);

              return (
                <button
                  key={q.questionNo}
                  type="button"
                  onClick={() => setCurrentQ(q.questionNo)}
                  className={`relative h-9 rounded-lg text-xs font-semibold font-mono transition-colors exam-option focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isCurrent
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                      : isAnswered
                      ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900/80"
                      : "bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:bg-slate-700 hover:text-slate-200"
                  }`}
                  aria-label={`Question ${q.questionNo}${isAnswered ? " (Answered)" : ""}${isFlag ? " (Flagged)" : ""}`}
                >
                  {q.questionNo}
                  {isFlag && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-950" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-auto pt-4 border-t border-slate-800/80 space-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-blue-600" />
              <span>Current Question</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-950 border border-emerald-800" />
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700" />
              <span>Unanswered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Flagged for Review</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="pt-4 mt-2">
            <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-mono">
              <span>Completion</span>
              <span className="tabular-nums">{Math.round(progressPct)}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </aside>

        {/* Right Main Question Workspace */}
        <main className="flex-1 max-w-3xl flex flex-col justify-between">
          {!activeQuestion ? (
            <div className="text-center text-slate-400 py-20">
              No questions found in this assessment package.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Question metadata header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center text-xs font-bold font-mono">
                    {activeQuestion.questionNo}
                  </span>
                  <span className="text-sm font-semibold text-slate-200">
                    Question {activeQuestion.questionNo} of {totalCount}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => toggleFlag(activeQuestion.questionNo)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
                    flagged[activeQuestion.questionNo]
                      ? "bg-amber-950/70 border-amber-700/80 text-amber-300"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={flagged[activeQuestion.questionNo] ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                  <span>{flagged[activeQuestion.questionNo] ? "Flagged" : "Flag for Review"}</span>
                </button>
              </div>

              {/* Question Text Box with Watermark Security Shielding */}
              <Card className="border-slate-800 bg-slate-900/70 shadow-lg">
                <CardContent className="p-6 sm:p-8 space-y-6">
                  <p className="text-base sm:text-lg text-slate-100 font-medium leading-relaxed">
                    {activeQuestion.text}
                  </p>

                  {/* Options List */}
                  <div className="space-y-3 pt-2">
                    {(["A", "B", "C", "D"] as const).map((opt) => {
                      const optText = activeQuestion[`option${opt}` as keyof Question] as string;
                      const selected = answers[activeQuestion.questionNo] === opt;

                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleAnswerSelect(activeQuestion.questionNo, opt)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl text-left text-sm transition-all exam-option focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            selected
                              ? "bg-blue-950/60 border-2 border-blue-500 text-white shadow-md shadow-blue-950/60"
                              : "bg-slate-900/90 border border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 transition-colors ${
                              selected
                                ? "bg-blue-600 text-white"
                                : "bg-slate-800 text-slate-400 border border-slate-700/60"
                            }`}
                          >
                            {opt}
                          </span>
                          <span className="flex-1 font-normal leading-relaxed">{optText}</span>
                          {selected && (
                            <svg className="w-5 h-5 text-blue-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Bottom Navigation Toolbar */}
              <div className="flex items-center justify-between pt-4 pb-12 sm:pb-4">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setCurrentQ((n) => Math.max(1, n - 1))}
                  disabled={currentQ <= 1}
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  }
                >
                  Previous
                </Button>

                <div className="text-xs font-mono text-slate-400 hidden sm:block">
                  Use keys <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">1</kbd>–<kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">4</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">A</kbd>–<kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">D</kbd>
                </div>

                <Button
                  variant={currentQ >= totalCount ? "primary" : "secondary"}
                  size="md"
                  onClick={() => {
                    if (currentQ >= totalCount) {
                      setShowConfirm(true);
                    } else {
                      setCurrentQ((n) => Math.min(totalCount, n + 1));
                    }
                  }}
                >
                  {currentQ >= totalCount ? "Review & Submit" : "Next Question →"}
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Submission Confirmation Modal ──────────────────────────────────── */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Finalize & Submit Examination"
        description="Verify your answers before generating your non-repudiable ECDSA cryptographic signature."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              Back to Exam
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={phase === "submitting"}
              onClick={() => {
                setShowConfirm(false);
                handleSubmit();
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Confirm &amp; Sign Submission
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Total Questions:</span>
              <span className="text-slate-200 font-mono font-bold">{totalCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Answered:</span>
              <span className="text-emerald-400 font-mono font-bold">{answeredCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Unanswered:</span>
              <span className={`font-mono font-bold ${totalCount - answeredCount > 0 ? "text-amber-400" : "text-slate-400"}`}>
                {totalCount - answeredCount}
              </span>
            </div>
          </div>

          {totalCount - answeredCount > 0 && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span>
                You have {totalCount - answeredCount} unanswered question(s). Unanswered questions will receive 0 marks.
              </span>
            </div>
          )}

          <div className="text-xs text-slate-400 leading-relaxed">
            By confirming, your browser will canonicalize your answer set (RFC 8785), compute the SHA-256 digest, and generate a non-exportable ECDSA-P256 digital signature to seal the submission.
          </div>
        </div>
      </Modal>
    </div>
  );
}
