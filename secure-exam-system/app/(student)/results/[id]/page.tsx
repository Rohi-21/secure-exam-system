"use client";
/**
 * Student Results Page — /student/results/[id]
 * Fetches encrypted result over ECDH session, decrypts in browser,
 * displays score + examiner signature status + Merkle inclusion proof.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

function getToken(): string {
  return (window as typeof window & { __accessToken?: string }).__accessToken ?? "";
}

interface ResultPayload {
  score: number;
  totalQuestions: number;
  correct: number;
  incorrect: number;
  details: Record<string, { given: string; correct: string; isCorrect: boolean }>;
}

interface MerkleProof {
  root: string;
  leafIndex: number;
  leafHash: string;
  siblings: Array<{ hash: string; position: "left" | "right" }>;
}

export default function StudentResultsPage() {
  const { id: examId } = useParams() as { id: string };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [sigValid, setSigValid] = useState<boolean | null>(null);
  const [merkleProof, setMerkleProof] = useState<MerkleProof | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    // sessionId is stored in sessionStorage after ECDH handshake
    const sid = sessionStorage.getItem(`session-${examId}`) ?? "";
    setSessionId(sid);
    if (sid) fetchResult(sid);
    else setError("No active exam session found. Please start the exam first.");
    setLoading(false);
  }, [examId]);

  async function fetchResult(sid: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/exam/${examId}/results?sessionId=${sid}`, {
        headers: { Authorization: `Bearer ${getToken()}`, "x-session-id": sid },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }

      // ── Decrypt result with ECDH session key (browser-side) ──────────
      const sessionKeyRaw = sessionStorage.getItem(`session-key-enc-${examId}`);
      if (!sessionKeyRaw) {
        setError("Session encryption key not found. Please log in and re-open the exam.");
        return;
      }

      const encKey = await crypto.subtle.importKey(
        "raw",
        hexToBytes(sessionKeyRaw).buffer.slice(0) as ArrayBuffer,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      const { ciphertext, authTag, iv } = data.result;
      const ctBuf = base64ToBytes(ciphertext);
      const tagBuf = base64ToBytes(authTag);
      const combined = new Uint8Array(ctBuf.length + tagBuf.length);
      combined.set(ctBuf); combined.set(tagBuf, ctBuf.length);

      const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(iv).buffer.slice(0) as ArrayBuffer },
        encKey,
        combined.buffer.slice(0) as ArrayBuffer
      );
      const plainText = new TextDecoder().decode(plainBuf);
      const parsed: ResultPayload = JSON.parse(plainText);

      setResult(parsed);
      setSigValid(data.examinerSignatureValid ?? false);
      setMerkleProof(data.merkleProof);
      setSubmissionId(data.submissionId ?? "");
      setContentHash(data.contentHash ?? "");

    } catch (e: unknown) {
      setError(`Decryption failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Your Results</h1>
          <p className="text-gray-400 text-sm mt-1">Exam ID: <code className="text-blue-400">{examId}</code></p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        {result && (
          <>
            {/* Score card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
              <div className={`text-6xl font-bold mb-2 ${result.score >= 50 ? "text-green-400" : "text-red-400"}`}>
                {result.score}%
              </div>
              <p className="text-gray-400 text-sm">
                {result.correct} correct / {result.incorrect} incorrect out of {result.totalQuestions} questions
              </p>
              <div className={`mt-3 inline-block px-4 py-1 rounded-full text-sm font-medium ${
                result.score >= 50 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
              }`}>
                {result.score >= 50 ? "PASS" : "FAIL"}
              </div>
            </div>

            {/* Per-question breakdown */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h2 className="text-white font-semibold mb-3 text-sm">Question Breakdown</h2>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(result.details).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([qNo, d]) => (
                  <div key={qNo} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                    d.isCorrect ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    <span className="font-bold">Q{qNo}</span>
                    <span>Your: <strong>{d.given || "—"}</strong></span>
                    {!d.isCorrect && <span>Ans: <strong>{d.correct}</strong></span>}
                    <span className="ml-auto">{d.isCorrect ? "✓" : "✗"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cryptographic integrity panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
              <h2 className="text-white font-semibold text-sm">Cryptographic Integrity</h2>

              {/* Examiner signature */}
              <IntegrityRow
                label="Examiner Signature (Ed25519)"
                valid={sigValid === true}
                detail={sigValid === true ? "Result authenticated by examiner key" : "Signature not verified"}
              />

              {/* Submission hash */}
              {contentHash && (
                <div className="text-xs text-gray-400">
                  <span className="text-gray-500">Submission Hash: </span>
                  <code className="text-blue-300 break-all">{contentHash}</code>
                </div>
              )}

              {/* Merkle proof */}
              {merkleProof ? (
                <div>
                  <IntegrityRow
                    label="Merkle Inclusion Proof"
                    valid={true}
                    detail={`Root: ${merkleProof.root?.slice(0, 20)}… | Depth: ${merkleProof.siblings?.length}`}
                  />
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">View full proof</summary>
                    <pre className="mt-2 text-xs text-gray-400 bg-gray-800 p-2 rounded overflow-x-auto">
                      {JSON.stringify(merkleProof, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <IntegrityRow label="Merkle Inclusion Proof" valid={false} detail="Proof not yet available" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IntegrityRow({ label, valid, detail }: { label: string; valid: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 text-sm ${valid ? "text-green-400" : "text-yellow-400"}`}>{valid ? "✓" : "⚠"}</span>
      <div>
        <p className="text-xs text-white">{label}</p>
        <p className="text-xs text-gray-400">{detail}</p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-blue-400 animate-pulse text-lg">Loading results…</div>
    </div>
  );
}

// Helpers
function hexToBytes(hex: string): Uint8Array {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return a;
}
function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
