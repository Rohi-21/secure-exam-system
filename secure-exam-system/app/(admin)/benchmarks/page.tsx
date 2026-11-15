"use client";

/**
 * Performance Benchmark Dashboard — /admin/benchmarks
 * Live runtime comparisons: AES-256-GCM vs CBC and Argon2id vs PBKDF2 vs bcrypt.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";

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
  { key: "cipher", label: "Cipher Throughput (AES-GCM vs CBC)" },
  { key: "kdf", label: "KDF Latency (Argon2id vs PBKDF2)" },
  { key: "summary", label: "Architectural Synthesis" },
];

const PAYLOAD_SIZES = ["1KB", "16KB", "64KB", "1MB"];
const ALGO_COLORS: Record<string, string> = {
  "AES-256-GCM": "bg-blue-500",
  "AES-256-CBC+HMAC": "bg-amber-500",
  "AES-256-CTR (no auth)": "bg-slate-600",
  "Argon2id": "bg-emerald-500",
  "PBKDF2-SHA256 (100K iter)": "bg-rose-500",
  "PBKDF2-SHA256 (600K iter)": "bg-orange-500",
  "bcrypt (cost 10)": "bg-purple-500",
  "bcrypt (cost 12)": "bg-indigo-500",
};

export default function BenchmarksPage() {
  const [cipherData, setCipherData] = useState<CipherResult[]>([]);
  const [kdfData, setKdfData] = useState<KDFResult[]>([]);
  const [tab, setTab] = useState<Tab>("cipher");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [runningBench, setRunningBench] = useState<"cipher" | "kdf" | null>(null);

  useEffect(() => {
    loadResults();
  }, []);

  async function loadResults() {
    setLoading(true);
    setError("");
    try {
      const [cr, kr] = await Promise.all([
        fetch("/api/benchmarks/cipher").then((r) => r.json()),
        fetch("/api/benchmarks/kdf").then((r) => r.json()),
      ]);
      if (cr.results) setCipherData(cr.results);
      if (kr.results) setKdfData(kr.results);
    } catch (e: unknown) {
      setError(`Could not load benchmark results: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runBenchmark(type: "cipher" | "kdf") {
    setRunningBench(type);
    try {
      const res = await fetch(`/api/benchmarks/run?type=${type}`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadResults();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRunningBench(null);
    }
  }

  const cipherBySize = PAYLOAD_SIZES.map((size) =>
    cipherData.filter((r) => r.payloadSizeLabel === size)
  );
  const maxThroughput = Math.max(...cipherData.map((r) => r.throughputMBps), 1);
  const maxKDFMs = Math.max(...kdfData.map((r) => r.avgHashMs), 1);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="Cryptographic Engine Benchmarks"
          description="Empirical execution metrics evaluating AES-256-GCM AEAD throughput and Argon2id memory-hard password resistance."
          backHref="/admin"
          backLabel="Admin Console"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                loading={runningBench === "cipher"}
                disabled={Boolean(runningBench)}
                onClick={() => runBenchmark("cipher")}
              >
                Benchmark Ciphers
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={runningBench === "kdf"}
                disabled={Boolean(runningBench)}
                onClick={() => runBenchmark("kdf")}
              >
                Benchmark KDFs
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={loadResults}
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                }
              >
                Reload
              </Button>
            </div>
          }
        >
          {error && (
            <div className="mb-6 p-4 bg-red-950/50 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Segmented Tab Navigation */}
          <div className="flex gap-2 p-1.5 mb-8 bg-slate-900 border border-slate-800 rounded-xl w-fit">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.key
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-900/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-20 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-mono">Loading performance telemetry…</p>
            </div>
          ) : (
            <>
              {/* ── Cipher Tab ──────────────────────────────────────────────── */}
              {tab === "cipher" && (
                <div className="space-y-6">
                  {/* Visual Bar Comparison per Payload Size */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {cipherBySize.map(
                      (group, gi) =>
                        group.length > 0 && (
                          <Card key={gi} className="border-slate-800">
                            <CardHeader className="flex flex-row items-center justify-between">
                              <CardTitle className="text-sm font-semibold">
                                Payload: {PAYLOAD_SIZES[gi]}
                              </CardTitle>
                              <Badge variant="info" size="sm">
                                Throughput (MB/s)
                              </Badge>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {group
                                .sort((a, b) => b.throughputMBps - a.throughputMBps)
                                .map((r) => (
                                  <div key={r.algorithm} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                                        <span>{r.algorithm}</span>
                                        {r.authenticationIncluded ? (
                                          <span className="text-[10px] text-emerald-400 font-mono">
                                            (AEAD)
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-amber-400 font-mono">
                                            (No Auth)
                                          </span>
                                        )}
                                      </span>
                                      <span className="font-mono text-slate-300 tabular-nums">
                                        {r.throughputMBps.toFixed(1)} MB/s
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          ALGO_COLORS[r.algorithm] ?? "bg-blue-500"
                                        }`}
                                        style={{
                                          width: `${Math.min(100, (r.throughputMBps / maxThroughput) * 100)}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}
                            </CardContent>
                          </Card>
                        )
                    )}
                  </div>

                  {/* Detailed Cipher Table */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-200">
                      Full Micro-Benchmark Metrics
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Algorithm</TableHead>
                          <TableHead>Payload Size</TableHead>
                          <TableHead className="text-right">Enc Latency</TableHead>
                          <TableHead className="text-right">Dec Latency</TableHead>
                          <TableHead className="text-right">Throughput</TableHead>
                          <TableHead>Authenticated AEAD</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cipherData.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-semibold text-slate-100 font-mono">
                              {r.algorithm}
                            </TableCell>
                            <TableCell className="font-mono text-slate-400">
                              {r.payloadSizeLabel}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-slate-300">
                              {r.encryptLatencyUs} &micro;s
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-slate-300">
                              {r.decryptLatencyUs} &micro;s
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums font-semibold text-blue-400">
                              {r.throughputMBps.toFixed(1)} MB/s
                            </TableCell>
                            <TableCell>
                              {r.authenticationIncluded ? (
                                <Badge variant="success" size="sm">
                                  Valid AEAD
                                </Badge>
                              ) : (
                                <Badge variant="danger" size="sm">
                                  Vulnerable
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* ── KDF Tab ────────────────────────────────────────────────── */}
              {tab === "kdf" && (
                <div className="space-y-6">
                  <Card className="border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Average Hash Latency</CardTitle>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Higher memory/latency prevents GPU and ASIC brute-force password cracking.
                        </p>
                      </div>
                      <Badge variant="purple" size="sm">Memory Hard</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {kdfData.map((r) => (
                        <div key={r.algorithm} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-200 flex items-center gap-2">
                              <span>{r.algorithm}</span>
                              {r.rfcCompliant && (
                                <span className="text-[10px] text-emerald-400 font-mono">
                                  (RFC 9106)
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-slate-300 tabular-nums">
                              {r.avgHashMs.toFixed(1)} ms
                            </span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                ALGO_COLORS[r.algorithm] ?? "bg-emerald-500"
                              }`}
                              style={{
                                width: `${Math.min(100, (r.avgHashMs / maxKDFMs) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* KDF Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>KDF Algorithm</TableHead>
                        <TableHead className="text-right">Avg Execution Time</TableHead>
                        <TableHead className="text-right">Throughput (Ops/sec)</TableHead>
                        <TableHead>Memory Footprint</TableHead>
                        <TableHead>Standard &amp; Guidance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kdfData.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-semibold text-slate-100 font-mono">
                            {r.algorithm}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-slate-200 font-semibold">
                            {r.avgHashMs.toFixed(1)} ms
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-slate-400">
                            {r.opsPerSec.toFixed(2)}
                          </TableCell>
                          <TableCell className="font-mono text-slate-300 text-xs">
                            {String(r.memoryMB)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-400 max-w-sm">
                            {r.recommendation}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* ── Summary Tab ────────────────────────────────────────────── */}
              {tab === "summary" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {[
                    {
                      title: "Authenticated Cipher",
                      value: "AES-256-GCM",
                      detail:
                        "Provides hardware-accelerated Galois/Counter Mode AEAD. Over 900 MB/s throughput with integrated GMAC authentication tags, preventing padding-oracle and bit-flipping attacks.",
                      badge: "Core Primitive",
                    },
                    {
                      title: "Password KDF",
                      value: "Argon2id (RFC 9106)",
                      detail:
                        "Configured with 64MB memory cost, 3 time iterations, and 4 parallelism threads. Memory-hardness guarantees resistance against modern GPU/FPGA dictionary attacks.",
                      badge: "Password Defense",
                    },
                    {
                      title: "Session Secrecy",
                      value: "ECDH-P256 + HKDF-SHA256",
                      detail:
                        "Negotiated ephemerally per test session. Perfect Forward Secrecy ensures that even total long-term server key compromise cannot decrypt past test papers or responses.",
                      badge: "Forward Secret",
                    },
                    {
                      title: "Digital Signatures",
                      value: "ECDSA-P256 + Ed25519",
                      detail:
                        "Student submissions are signed via browser WebCrypto non-exportable ECDSA keys. Server audit ledger blocks and final evaluations are signed via Ed25519.",
                      badge: "Non-Repudiation",
                    },
                    {
                      title: "Key Custody Quorum",
                      value: "Shamir Secret Sharing (2-of-3)",
                      detail:
                        "Exam Master Key (ExamKEK) is split into 3 Shamir polynomial shares encrypted under trustee Argon2id passwords. No single administrator can decrypt exam papers.",
                      badge: "Threshold Security",
                    },
                    {
                      title: "Integrity Verification",
                      value: "Merkle Tree + SHA-256 Chain",
                      detail:
                        "Individual submission hashes are aggregated into a cryptographic Merkle tree. Every student receives a verifiable sibling proof against the published root.",
                      badge: "Zero-Knowledge Proof",
                    },
                  ].map((card) => (
                    <Card key={card.title} className="border-slate-800">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{card.title}</CardTitle>
                        <Badge variant="purple" size="sm">{card.badge}</Badge>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-base font-bold text-slate-100 font-mono">
                          {card.value}
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {card.detail}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
