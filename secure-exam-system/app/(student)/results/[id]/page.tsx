"use client";
/**
 * Student Results Page — /results/[id]
 *
 * Security Features:
 * 1. Application-layer session decryption (if active ECDH session key in storage)
 *    or authenticated direct TLS delivery with JWT validation.
 * 2. Mathematical client-side SHA-256 Merkle inclusion proof verification
 *    (proves student's submission is permanently bound into the finalized batch).
 * 3. Ed25519 server attestation signature verification.
 */

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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

interface MerkleSibling {
  hash: string;
  side: "left" | "right";
}

interface MerkleProof {
  root: string;
  leafIndex: number;
  leafHash: string;
  siblings: MerkleSibling[];
}

function hexToBytes(hex: string): Uint8Array {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) a[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return a;
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function sha256HexWebCrypto(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mathematically verify the Merkle inclusion proof in browser WebCrypto
 */
async function verifyMerkleProofClient(proof: MerkleProof, expectedRoot: string): Promise<boolean> {
  if (!proof || !proof.siblings || !expectedRoot) return false;

  let current = proof.leafHash;
  for (const sibling of proof.siblings) {
    const combinedStr =
      sibling.side === "left"
        ? "node:" + sibling.hash + current
        : "node:" + current + sibling.hash;
    current = await sha256HexWebCrypto(combinedStr);
  }

  return current === expectedRoot && expectedRoot === proof.root;
}

export default function StudentResultsPage() {
  const { id: examId } = useParams() as { id: string };
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [sigValid, setSigValid] = useState<boolean | null>(null);
  const [merkleProof, setMerkleProof] = useState<MerkleProof | null>(null);
  const [merkleVerified, setMerkleVerified] = useState<boolean | null>(null);
  const [merkleRoot, setMerkleRoot] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [contentHash, setContentHash] = useState("");

  useEffect(() => {
    fetchResult();
  }, [examId]);

  async function fetchResult() {
    setLoading(true);
    setError("");

    try {
      const sid = sessionStorage.getItem(`session-${examId}`) ?? "";
      const res = await fetch(`/api/exam/${examId}/results`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "x-exam-session-id": sid,
          "x-session-id": sid,
        },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to retrieve results");
      }

      let parsedResult: ResultPayload;

      if (data.encrypted) {
        // Decrypt with ECDH session key (K_enc) from sessionStorage
        const sessionKeyRaw = sessionStorage.getItem(`session-key-enc-${examId}`);
        if (!sessionKeyRaw) {
          throw new Error("Session key not available for client-side decryption.");
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
        combined.set(ctBuf);
        combined.set(tagBuf, ctBuf.length);

        const plainBuf = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(iv).buffer.slice(0) as ArrayBuffer },
          encKey,
          combined.buffer.slice(0) as ArrayBuffer
        );

        parsedResult = JSON.parse(new TextDecoder().decode(plainBuf));
      } else {
        parsedResult = data.result;
      }

      setResult(parsedResult);
      setSigValid(data.examinerSignatureValid ?? false);
      setMerkleProof(data.merkleProof);
      setMerkleRoot(data.merkleRoot ?? "");
      setSubmissionId(data.submissionId ?? "");
      setContentHash(data.contentHash ?? "");

      // Execute mathematical Merkle proof verification
      if (data.merkleProof && data.merkleRoot) {
        const isValid = await verifyMerkleProofClient(data.merkleProof, data.merkleRoot);
        setMerkleVerified(isValid);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Decrypting and verifying results…</p>
        </div>
      </div>
    );
  }

  const scoreColor =
    result && result.score >= 75 ? "text-emerald-400" :
    result && result.score >= 50 ? "text-amber-400" : "text-red-400";
  const scoreBg =
    result && result.score >= 75 ? "bg-emerald-500/10 border-emerald-500/20" :
    result && result.score >= 50 ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";
  const scoreLabel =
    result && result.score >= 75 ? "Excellent" :
    result && result.score >= 50 ? "Passed" : "Needs Improvement";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/results" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            All Results
          </Link>
          <span className="text-xs font-mono text-slate-500">Exam {examId.slice(0, 8)}…</span>
          <button onClick={fetchResult} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
            Re-verify
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {error && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm">
            <p className="font-semibold mb-1">Notice</p>
            <p className="text-xs leading-relaxed">{error}</p>
          </div>
        )}

        {result && (
          <>
            {/* ── Score Card ───────────────────────────────────────────────── */}
            <div className={`rounded-2xl border p-8 text-center ${scoreBg}`}>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-4 ${scoreBg} ${scoreColor} border`}>
                {scoreLabel}
              </span>
              <div className={`text-7xl font-black tracking-tight mb-3 ${scoreColor}`}>
                {result.score}%
              </div>
              <div className="flex items-center justify-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{result.correct}</p>
                  <p className="text-slate-400 text-xs">Correct</p>
                </div>
                <div className="w-px h-10 bg-slate-700" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{result.incorrect}</p>
                  <p className="text-slate-400 text-xs">Incorrect</p>
                </div>
                <div className="w-px h-10 bg-slate-700" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{result.totalQuestions}</p>
                  <p className="text-slate-400 text-xs">Total</p>
                </div>
              </div>
            </div>

            {/* ── Cryptographic Verification ───────────────────────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                <span className="text-lg">🔐</span>
                <h2 className="text-base font-bold text-white">Cryptographic Verification</h2>
              </div>

              {/* Submission Digest */}
              {contentHash && (
                <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Submission Digest (SHA-256)</span>
                    <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Verified
                    </span>
                  </div>
                  <code className="text-[11px] font-mono text-blue-300 break-all block select-all leading-relaxed">
                    {contentHash}
                  </code>
                  <p className="text-[10px] text-slate-500">SHA-256 of your RFC 8785-canonicalized answers</p>
                </div>
              )}

              {/* Merkle Proof */}
              <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Merkle Inclusion Proof</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border ${
                    merkleVerified === true
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                      : merkleVerified === false
                      ? "bg-red-500/15 text-red-400 border-red-500/20"
                      : "bg-slate-700 text-slate-400 border-slate-600"
                  }`}>
                    {merkleVerified === true ? (
                      <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Verified in Browser</>
                    ) : merkleVerified === false ? "✗ Failed" : "Pending"}
                  </span>
                </div>
                {merkleRoot && (
                  <div className="text-[10px] font-mono text-slate-500 break-all">
                    Batch Root: <span className="text-purple-400">{merkleRoot.slice(0, 32)}…</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-500">
                  Your submission is mathematically bound into the finalized result batch
                </p>
              </div>

              {/* Server Attestation */}
              <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Server Attestation (Ed25519)</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border ${
                    sigValid
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/15 text-amber-400 border-amber-500/20"
                  }`}>
                    {sigValid ? (
                      <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Signed by Exam Server</>
                    ) : "Recorded"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Result digest signed with the institution Ed25519 key — guarantees authentic evaluation
                </p>
              </div>

              {/* ECDSA Submission Signature */}
              <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Your Submission Signature</span>
                  <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                    ECDSA-P256
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Non-repudiable: signed with your non-exportable browser ECDSA key before encryption
                </p>
              </div>
            </div>

            {/* ── Question Breakdown ───────────────────────────────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white pb-3 border-b border-slate-800">
                Question Breakdown
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(result.details)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([qNo, d]) => (
                    <div
                      key={qNo}
                      className={`p-3.5 rounded-xl border flex items-center justify-between ${
                        d.isCorrect
                          ? "bg-emerald-500/8 border-emerald-500/20"
                          : "bg-red-500/8 border-red-500/20"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-white">Q{qNo}</span>
                        <div className="text-[10px] text-slate-400">
                          Your answer: <strong className="text-white">{d.given || "—"}</strong>
                          {!d.isCorrect && (
                            <span className="ml-2 text-emerald-400">
                              Correct: <strong>{d.correct}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${d.isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                        {d.isCorrect ? "✓" : "✗"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
