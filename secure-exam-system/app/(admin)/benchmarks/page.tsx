"use client";
/**
 * Performance Benchmark Dashboard — /admin/benchmarks
 *
 * Loads pre-generated JSON results from /api/benchmarks/results
 * and displays cipher + KDF comparison charts and tables.
 * Designed for CNS project evaluation and report screenshots.
 */

import { useState, useEffect } from "react";

interface CipherResult {
  algorithm: string;
  payloadSizeLabel: string;
  payloadSizeBytes: number;
  encryptionsPerSec: number;
  decryptionsPerSec: number;
  encryptLatencyUs: number;
  decryptLatencyUs: number;
  throughputMBps: number;
  authenticationIncluded: boolean;
  notes: string;
}

interface KDFResult {
  algorithm: string;
  parameters: Record<string, number | string>;
  avgHashMs: number;
  opsPerSec: number;
  memoryMB: number | string;
  rfcCompliant: boolean;
  recommendation: string;
  hashSample: string;
}

type Tab = "cipher" | "kdf" | "summary";

const TABS: { key: Tab; label: string }[] = [
  { key: "cipher", label: "Cipher Comparison" },
  { key: "kdf",    label: "KDF Comparison" },
  { key: "summary", label: "Security Summary" },
];

const PAYLOAD_SIZES = ["1KB", "16KB", "64KB", "1MB"];
const ALGO_COLORS: Record<string, string> = {
  "AES-256-GCM":        "#3b82f6",
  "AES-256-CBC+HMAC":   "#f59e0b",
  "AES-256-CTR (no auth)": "#6b7280",
  "Argon2id":           "#10b981",
  "PBKDF2-SHA256 (100K iter)": "#ef4444",
  "PBKDF2-SHA256 (600K iter)": "#f97316",
  "bcrypt (cost 10)":   "#a855f7",
  "bcrypt (cost 12)":   "#8b5cf6",
};

export default function BenchmarksPage() {
  const [cipherData, setCipherData] = useState<CipherResult[]>([]);
  const [kdfData, setKdfData]       = useState<KDFResult[]>([]);
  const [tab, setTab]               = useState<Tab>("cipher");
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [runningBench, setRunningBench] = useState<"cipher" | "kdf" | null>(null);

  useEffect(() => { loadResults(); }, []);

  async function loadResults() {
    setLoading(true); setError("");
    try {
      const [cr, kr] = await Promise.all([
        fetch("/api/benchmarks/cipher").then((r) => r.json()),
        fetch("/api/benchmarks/kdf").then((r) => r.json()),
      ]);
      if (cr.results) setCipherData(cr.results);
      if (kr.results) setKdfData(kr.results);
    } catch (e: unknown) {
      setError(`Could not load benchmark results. Run 'npm run bench:all' first. ${(e as Error).message}`);
    } finally { setLoading(false); }
  }

  async function runBenchmark(type: "cipher" | "kdf") {
    setRunningBench(type);
    try {
      const res = await fetch(`/api/benchmarks/run?type=${type}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadResults();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally { setRunningBench(null); }
  }

  const cipherBySize = PAYLOAD_SIZES.map((size) =>
    cipherData.filter((r) => r.payloadSizeLabel === size)
  );
  const maxThroughput = Math.max(...cipherData.map((r) => r.throughputMBps), 1);
  const maxKDFMs = Math.max(...kdfData.map((r) => r.avgHashMs), 1);

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Performance Benchmarks</h1>
            <p className="text-gray-400 text-sm mt-1">
              CNS Project · Node.js v22 · AES-256-GCM vs CBC+HMAC · Argon2id vs PBKDF2 vs bcrypt
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => runBenchmark("cipher")} disabled={!!runningBench}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs">
              {runningBench === "cipher" ? "⟳ Running…" : "▶ Run Cipher"}
            </button>
            <button onClick={() => runBenchmark("kdf")} disabled={!!runningBench}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs">
              {runningBench === "kdf" ? "⟳ Running…" : "▶ Run KDF"}
            </button>
            <button onClick={loadResults} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs">
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700/40 rounded-lg text-amber-300 text-sm">{error}</div>}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 p-1 rounded-xl w-fit">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center text-gray-500 py-16 animate-pulse">Loading benchmark data…</div>}

        {/* ── Cipher Tab ────────────────────────────────────────────── */}
        {!loading && tab === "cipher" && (
          <div className="space-y-6">
            {/* Throughput chart per payload size */}
            {cipherBySize.map((group, gi) => group.length > 0 && (
              <div key={gi} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h2 className="text-white font-semibold mb-4 text-sm">
                  Payload: {PAYLOAD_SIZES[gi]} — Encryption Throughput (MB/s)
                </h2>
                <div className="space-y-3">
                  {group.sort((a, b) => b.throughputMBps - a.throughputMBps).map((r) => (
                    <div key={r.algorithm} className="flex items-center gap-3">
                      <div className="w-44 text-xs text-gray-300 truncate flex-shrink-0">
                        {r.algorithm}
                        {r.authenticationIncluded
                          ? <span className="ml-1 text-green-500 text-[10px]">🔒 AEAD</span>
                          : <span className="ml-1 text-red-500 text-[10px]">⚠ no-auth</span>}
                      </div>
                      <div className="flex-1 bg-gray-800 rounded h-5 overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${(r.throughputMBps / maxThroughput) * 100}%`,
                            background: ALGO_COLORS[r.algorithm] ?? "#6b7280",
                          }}
                        />
                      </div>
                      <div className="w-20 text-right text-xs text-gray-300 flex-shrink-0">
                        {r.throughputMBps.toFixed(1)} MB/s
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Full table */}
            {cipherData.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-800">
                  <h2 className="text-white font-semibold text-sm">Full Results Table</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-800 text-gray-400">
                      <tr>
                        <th className="px-4 py-2 text-left">Algorithm</th>
                        <th className="px-4 py-2 text-left">Size</th>
                        <th className="px-4 py-2 text-right">Enc Latency</th>
                        <th className="px-4 py-2 text-right">Dec Latency</th>
                        <th className="px-4 py-2 text-right">Throughput</th>
                        <th className="px-4 py-2 text-left">Auth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cipherData.map((r, i) => (
                        <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/40">
                          <td className="px-4 py-2 text-white font-medium">{r.algorithm}</td>
                          <td className="px-4 py-2 text-gray-400">{r.payloadSizeLabel}</td>
                          <td className="px-4 py-2 text-right font-mono text-gray-300">{r.encryptLatencyUs} µs</td>
                          <td className="px-4 py-2 text-right font-mono text-gray-300">{r.decryptLatencyUs} µs</td>
                          <td className="px-4 py-2 text-right font-mono text-blue-300">{r.throughputMBps} MB/s</td>
                          <td className="px-4 py-2">
                            {r.authenticationIncluded
                              ? <span className="text-green-400">✓ Yes</span>
                              : <span className="text-red-400">✗ No</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KDF Tab ───────────────────────────────────────────────── */}
        {!loading && tab === "kdf" && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4 text-sm">Average Hash Time (ms) — lower is faster, but KDFs should be slow</h2>
              <div className="space-y-3">
                {kdfData.map((r) => (
                  <div key={r.algorithm} className="flex items-center gap-3">
                    <div className="w-56 text-xs text-gray-300 flex-shrink-0">
                      {r.algorithm}
                      {r.rfcCompliant
                        ? <span className="ml-1 text-green-500 text-[10px]">✓ RFC</span>
                        : <span className="ml-1 text-gray-500 text-[10px]">non-std</span>}
                    </div>
                    <div className="flex-1 bg-gray-800 rounded h-5 overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(r.avgHashMs / maxKDFMs) * 100}%`,
                          background: ALGO_COLORS[r.algorithm] ?? "#6b7280",
                        }}
                      />
                    </div>
                    <div className="w-20 text-right text-xs text-gray-300 flex-shrink-0">
                      {r.avgHashMs.toFixed(1)} ms
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <h2 className="text-white font-semibold text-sm">KDF Comparison Table</h2>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-800 text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Algorithm</th>
                    <th className="px-4 py-2 text-right">Avg (ms)</th>
                    <th className="px-4 py-2 text-right">Ops/sec</th>
                    <th className="px-4 py-2 text-left">Memory</th>
                    <th className="px-4 py-2 text-left">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {kdfData.map((r, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/40">
                      <td className="px-4 py-2 text-white font-medium">{r.algorithm}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-300">{r.avgHashMs.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-300">{r.opsPerSec.toFixed(2)}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{String(r.memoryMB)}</td>
                      <td className="px-4 py-2 text-xs text-gray-400 max-w-xs">{r.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Summary Tab ───────────────────────────────────────────── */}
        {!loading && tab === "summary" && (
          <div className="grid grid-cols-2 gap-4">
            {[
              { title: "Chosen Cipher", value: "AES-256-GCM", detail: "AEAD — authenticated encryption. ~950 MB/s on 1MB payloads.", color: "blue" },
              { title: "Chosen KDF", value: "Argon2id", detail: "RFC 9106. 64MB memory, 3 iterations, 4 threads. ~280ms/hash.", color: "green" },
              { title: "Key Exchange", value: "ECDH-P256 + HKDF", detail: "Ephemeral per-session. Provides Perfect Forward Secrecy above TLS.", color: "purple" },
              { title: "Signing", value: "Ed25519 + ECDSA-P256", detail: "Ed25519 for audit chain. ECDSA-P256 for student submissions.", color: "yellow" },
              { title: "Key Custody", value: "Shamir 2-of-3", detail: "Per-exam KEK split. No single administrator can access exam data.", color: "red" },
              { title: "Integrity", value: "Merkle Tree + SHA-256 Chain", detail: "Submission integrity + tamper-evident audit log with external anchoring.", color: "teal" },
              { title: "Watermarking", value: "Unicode ZWC Steganography", detail: "Per-student invisible watermarks for exam paper leak forensics.", color: "orange" },
              { title: "Commitment", value: "SHA-256 Commit-Reveal", detail: "Answer key committed before exam opens. Verifiable post-exam reveal.", color: "pink" },
            ].map((card) => (
              <div key={card.title} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">{card.title}</div>
                <div className="text-white font-bold text-base mb-1">{card.value}</div>
                <div className="text-gray-400 text-xs">{card.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
