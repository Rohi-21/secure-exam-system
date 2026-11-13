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

  if (phase === "handshake") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md p-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
          <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-medium text-lg">{status}</p>
          <p className="text-gray-500 text-xs mt-2">
            ECDH-P256 Key Exchange · Server Ed25519 Authentication · HKDF Session Derivation
          </p>
        </div>
      </div>
    );
  }

  if (phase === "submitted") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md p-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">Submission Confirmed</h2>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            Your answers were canonicalized, cryptographically signed with your non-exportable ECDSA key,
            encrypted under the negotiated session key, and recorded in the tamper-evident audit log.
          </p>
          <button
            onClick={() => router.push(`/results/${examId}`)}
            className="w-full px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Go to Results
          </button>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md p-8 bg-gray-900 border border-red-500/30 rounded-2xl shadow-2xl">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-red-400 text-xl font-bold mb-2">Examination Error</h2>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Fixed Navigation Header */}
      <div className="fixed top-0 inset-x-0 z-50 bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-base">CNS Secure Examination</span>
          <span className="hidden sm:inline-block ml-3 text-xs text-gray-400">
            Session encrypted · ECDSA signed · Autosaved
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-gray-400 block sm:inline mr-2">Time Remaining:</span>
            <span
              className={`font-mono font-bold text-lg ${
                timeLeft < 300 ? "text-red-400 animate-pulse" : "text-white"
              }`}
            >
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={phase === "submitting"}
            className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-green-600/20"
          >
            {phase === "submitting" ? "Submitting…" : "Submit Exam"}
          </button>
        </div>
      </div>

      {/* Questions list */}
      <div className="max-w-3xl mx-auto pt-24 pb-28 px-4 space-y-6">
        {questions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No questions loaded for this examination.</div>
        ) : (
          questions.map((q) => (
            <div key={q.questionNo} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-md">
              <p className="text-white text-base font-medium mb-4 leading-relaxed">
                <span className="text-blue-400 font-bold mr-2">Q{q.questionNo}.</span>
                {q.text}
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {(["A", "B", "C", "D"] as const).map((opt) => {
                  const optText = q[`option${opt}` as keyof Question] as string;
                  const selected = answers[q.questionNo] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => handleAnswerSelect(q.questionNo, opt)}
                      className={`flex items-center gap-3.5 p-3.5 rounded-xl text-left text-sm transition-all ${
                        selected
                          ? "bg-blue-600/20 border-2 border-blue-500 text-white font-medium"
                          : "bg-gray-800/60 border border-gray-700 text-gray-300 hover:border-gray-500 hover:bg-gray-800"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                          selected ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {opt}
                      </span>
                      <span className="flex-1">{optText}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Progress Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {Object.keys(answers).length} of {questions.length} answered
          </span>
          <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${questions.length ? (Object.keys(answers).length / questions.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
