"use client";

/**
 * Immutable Audit Log Page — /audit
 * Visualizes the SHA-256 parent-linked hash chain and verifies Ed25519 audit signatures.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

function getToken(): string {
  return (window as typeof window & { __accessToken?: string }).__accessToken ?? "";
}

interface AuditEntry {
  sequenceNo: number;
  eventType: string;
  actorId: string | null;
  examId: string | null;
  eventData: Record<string, unknown>;
  timestamp: string;
  entryHash: string;
  prevHash: string;
  auditSig: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [firstInvalid, setFirstInvalid] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    // Automatically load and verify audit chain on mount
    loadAudit(true);
  }, []);

  async function loadAudit(verify: boolean = false) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/audit${verify ? "?verify=true" : ""}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntries(data.entries ?? []);
      if (verify) {
        setChainValid(data.chainValid);
        setFirstInvalid(data.firstInvalidIndex ?? null);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const getEventBadgeVariant = (eventType: string) => {
    if (eventType.includes("REGISTER") || eventType.includes("USER")) return "info";
    if (eventType.includes("ACTIVATED") || eventType.includes("RELEASED")) return "success";
    if (eventType.includes("CLOSED")) return "warning";
    if (eventType.includes("KEY") || eventType.includes("SHAMIR")) return "purple";
    return "default";
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="Immutable Audit Hash Chain"
          description="Every critical examination lifecycle event is chained via SHA-256 digests and signed with an independent Ed25519 institutional audit key."
          backHref="/admin"
          backLabel="Admin Console"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                loading={loading}
                onClick={() => loadAudit(false)}
              >
                Reload Ledger
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={loading}
                onClick={() => loadAudit(true)}
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              >
                Verify Hash Chain
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

          {/* Chain Integrity Verification Banner */}
          {chainValid !== null && (
            <div
              className={`mb-6 p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
                chainValid
                  ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-300"
                  : "bg-red-950/50 border-red-800/80 text-red-300"
              }`}
            >
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    chainValid
                      ? "bg-emerald-900/60 border border-emerald-700/80 text-emerald-300"
                      : "bg-red-900/60 border border-red-700/80 text-red-300"
                  }`}
                >
                  {chainValid ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {chainValid
                      ? "Cryptographic Chain Integrity Confirmed"
                      : `Hash Chain Discontinuity Detected at Block #${firstInvalid}`}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    {chainValid
                      ? "All SHA-256 parent digests, sequential block heights, and Ed25519 signatures match."
                      : "Block digest mismatch detected. Potential database tampering or retroactive modification."}
                  </p>
                </div>
              </div>

              <Badge variant={chainValid ? "success" : "danger"} size="md" dot>
                {chainValid ? "100% Tamper-Evident" : "Compromised"}
              </Badge>
            </div>
          )}

          {/* Entries Container */}
          {loading && entries.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-mono">Verifying SHA-256 audit chain…</p>
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              title="Audit Ledger Empty"
              description="No cryptographic blocks recorded yet. Actions taken on the platform will automatically chain here."
              actionLabel="Load Audit Chain"
              onAction={() => loadAudit(true)}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 text-xs font-mono text-slate-400 border-b border-slate-800/80">
                <span>{entries.length} Blocks Chained</span>
                <span>Click a block to inspect full SHA-256 digests</span>
              </div>

              {entries.map((entry, idx) => {
                const isBroken = firstInvalid !== null && idx >= firstInvalid;
                const isExp = expanded === entry.sequenceNo;

                return (
                  <Card
                    key={entry.sequenceNo}
                    hover
                    className={`border-slate-800 overflow-hidden transition-all ${
                      isBroken ? "border-red-800 bg-red-950/20" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isExp ? null : entry.sequenceNo)}
                      className="w-full p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left focus:outline-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 font-mono text-xs font-bold text-slate-300 flex items-center justify-center shrink-0 tabular-nums">
                          #{entry.sequenceNo}
                        </span>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={getEventBadgeVariant(entry.eventType)} size="sm">
                              {entry.eventType}
                            </Badge>
                            <span className="text-xs font-mono text-slate-400 tabular-nums">
                              {new Date(entry.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "medium" })}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-400 truncate mt-1">
                            Actor: <span className="text-slate-300">{entry.actorId ? entry.actorId.slice(0, 16) + "…" : "System Kernel"}</span>
                            {entry.examId && (
                              <span className="ml-3 text-slate-400">
                                Exam: <span className="text-blue-400">{entry.examId.slice(0, 12)}…</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 font-mono text-xs">
                        <div className="text-right hidden md:block">
                          <div className="text-[10px] text-slate-500 uppercase">Block Digest</div>
                          <div className={`font-semibold ${isBroken ? "text-red-400" : "text-emerald-400"}`}>
                            {entry.entryHash.slice(0, 12)}…
                          </div>
                        </div>
                        <svg
                          className={`w-4 h-4 text-slate-500 transition-transform ${isExp ? "rotate-180" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded Detail Panel */}
                    {isExp && (
                      <div className="px-5 pb-5 pt-3 border-t border-slate-800/80 bg-slate-950/70 space-y-3 font-mono text-xs">
                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-400 uppercase font-semibold">Entry SHA-256 Digest:</span>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400 break-all select-all">
                            {entry.entryHash}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-400 uppercase font-semibold">Previous Block Hash (Parent Link):</span>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-purple-400 break-all select-all">
                            {entry.prevHash}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-400 uppercase font-semibold">Ed25519 Audit Signature:</span>
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-blue-400 break-all select-all text-[11px]">
                            {entry.auditSig}
                          </div>
                        </div>

                        {Object.keys(entry.eventData).length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-400 uppercase font-semibold">Decoded Event Payload:</span>
                            <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[11px] overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(entry.eventData, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
