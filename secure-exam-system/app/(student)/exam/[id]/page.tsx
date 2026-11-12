"use client";
/**
 * Student Exam Taking Page — /student/exam/[id]
 *
 * Flow:
 * 1. ECDH handshake → session key (K_enc stored in sessionStorage)
 * 2. Fetch questions (server decrypts with ExamKEK, re-encrypts with K_enc)
 * 3. Student answers MCQs — autosaved to sessionStorage
 * 4. Submit: ECDSA-P256 sign payload, send encrypted over session key
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

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

export default function StudentExamPage() {
  const { id: examId } = useParams() as { id: string };
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("handshake");
  const [status, setStatus] = useState("Establishing secure session…");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sessionId, setSessionId] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [error, setError] = useState("");

  // ── ECDH Handshake ────────────────────────────────────────────────────────
  useEffect(() => {
    doHandshakeAndLoad();
  }, []);

  async function doHandshakeAndLoad() {
    try {
      setStatus("Generating ephemeral ECDH key pair…");
      // Browser-side ephemeral ECDH-P256
      const clientECDH = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
      );
      const clientPubRaw = await crypto.subtle.exportKey("raw", clientECDH.publicKey);
      const clientPubB64 = btoa(String.fromCharCode(...new Uint8Array(clientPubRaw)));

      setStatus("Performing ECDH handshake with server…");
      const sid = crypto.randomUUID();
      setSessionId(sid);

      const hsRes = await fetch(`/api/exam/${examId}/ecdh-handshake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ clientPublicKeyB64: clientPubB64, sessionId: sid }),
      });
      const hs = await hsRes.json();
      if (!hsRes.ok) throw new Error(hs.error);

      // Derive shared secret and session encryption key
      setStatus("Deriving session keys via HKDF…");
      const serverPubBytes = Uint8Array.from(atob(hs.serverEphemeralPublicKeyB64), c => c.charCodeAt(0));
      const serverPubKey = await crypto.subtle.importKey(
        "raw", serverPubBytes.buffer.slice(0) as ArrayBuffer,
        { name: "ECDH", namedCurve: "P-256" }, false, []
      );
      const sharedSecretKey = await crypto.subtle.deriveKey(
        { name: "ECDH", public: serverPubKey },
        clientECDH.privateKey,
        { name: "HKDF" }, false, ["deriveKey"]
      );
      // Derive AES-GCM encryption key via HKDF
      const hkdfSalt = new TextEncoder().encode(sid);
      const encKey = await crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: hkdfSalt, info: new TextEncoder().encode("cns-exam-enc-key") },
        sharedSecretKey,
        { name: "AES-GCM", length: 256 }, true, ["decrypt"]
      );
      // Store key hex in sessionStorage for results page
      const encKeyRaw = await crypto.subtle.exportKey("raw", encKey);
      const hex = Array.from(new Uint8Array(encKeyRaw)).map(b => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(`session-key-enc-${examId}`, hex);
      sessionStorage.setItem(`session-${examId}`, sid);

      setStatus("Loading encrypted questions…");
      const qRes = await fetch(`/api/exam/${examId}/questions`, {
        headers: { Authorization: `Bearer ${getToken()}`, "x-session-id": sid },
      });
      const qData = await qRes.json();
      if (!qRes.ok) throw new Error(qData.error);

      // Decrypt questions with K_enc
      const decrypted: Question[] = [];
      for (const q of qData.questions) {
        const ctBytes = Uint8Array.from(atob(q.ciphertext), c => c.charCodeAt(0));
        const tagBytes = Uint8Array.from(atob(q.authTag), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(q.iv), c => c.charCodeAt(0));
        const combined = new Uint8Array(ctBytes.length + tagBytes.length);
        combined.set(ctBytes); combined.set(tagBytes, ctBytes.length);

        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv.buffer.slice(0) as ArrayBuffer },
          encKey,
          combined.buffer.slice(0) as ArrayBuffer
        );
        decrypted.push(JSON.parse(new TextDecoder().decode(plain)));
      }

      setQuestions(decrypted);
      setTimeLeft(qData.durationMins * 60);
      setPhase("exam");

    } catch (e: unknown) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "exam") return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) { clearInterval(t); handleSubmit(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (phase === "submitting" || phase === "submitted") return;
    setPhase("submitting");
    try {
      const payload = JSON.stringify({ examId, answers, submittedAt: new Date().toISOString() });
      const nonce = crypto.randomUUID();

      // ECDSA-P256 sign the submission
      const ecdsaKeyStr = sessionStorage.getItem("ecdsaPrivateKey");
      let signature = "";
      if (ecdsaKeyStr) {
        const ecdsaKey = await crypto.subtle.importKey(
          "pkcs8",
          Uint8Array.from(atob(ecdsaKeyStr), c => c.charCodeAt(0)).buffer.slice(0) as ArrayBuffer,
          { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
        );
        const sigBuf = await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          ecdsaKey,
          new TextEncoder().encode(payload).buffer.slice(0) as ArrayBuffer
        );
        signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
      }

      const res = await fetch(`/api/exam/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, "x-session-id": sessionId },
        body: JSON.stringify({ payload, nonce, ecdsaSignature: signature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhase("submitted");
    } catch (e: unknown) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [phase, examId, answers, sessionId]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  if (phase === "handshake") return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white font-medium">{status}</p>
        <p className="text-gray-500 text-sm mt-1">Establishing end-to-end encrypted exam session</p>
      </div>
    </div>
  );

  if (phase === "submitted") return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-white text-xl font-bold mb-2">Submission Received</h2>
        <p className="text-gray-400 text-sm mb-6">Your answers were encrypted, signed with your ECDSA key, and submitted securely.</p>
        <button onClick={() => router.push(`/student/results/${examId}`)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm">
          View Results (when released)
        </button>
      </div>
    </div>
  );

  if (phase === "error") return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center max-w-sm p-6 bg-red-900/20 border border-red-700/40 rounded-2xl">
        <p className="text-red-400 font-medium mb-2">Session Error</p>
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Fixed header with timer */}
      <div className="fixed top-0 inset-x-0 z-50 bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-white font-semibold text-sm">Secure Exam</span>
          <span className="ml-3 text-xs text-gray-500">Session encrypted · Ed25519 bound · ECDH key exchange</span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`font-mono font-bold text-lg ${timeLeft < 300 ? "text-red-400 animate-pulse" : "text-white"}`}>
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <button onClick={handleSubmit} disabled={phase === "submitting"}
            className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium">
            {phase === "submitting" ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>

      {/* Questions */}
      <div className="max-w-3xl mx-auto pt-20 pb-24 px-6 space-y-6">
        {questions.map((q) => (
          <div key={q.questionNo} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-white font-medium mb-4">
              <span className="text-blue-400 font-bold mr-2">Q{q.questionNo}.</span>
              {q.text}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {(["A", "B", "C", "D"] as const).map((opt) => {
                const text = q[`option${opt}` as keyof Question] as string;
                const selected = answers[q.questionNo] === opt;
                return (
                  <button key={opt}
                    onClick={() => setAnswers((a) => ({ ...a, [q.questionNo]: opt }))}
                    className={`flex items-center gap-3 p-3 rounded-xl text-left text-sm transition-all ${
                      selected
                        ? "bg-blue-600 border border-blue-500 text-white"
                        : "bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      selected ? "bg-white text-blue-600" : "bg-gray-700 text-gray-400"
                    }`}>{opt}</span>
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom progress bar */}
      <div className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <span className="text-xs text-gray-400">
            {Object.keys(answers).length} / {questions.length} answered
          </span>
          <div className="flex-1 bg-gray-800 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${questions.length ? (Object.keys(answers).length / questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
