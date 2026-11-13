"use client";
/**
 * Admin Audit Log Page — /audit
 * Displays the tamper-evident audit chain with chain verification.
 */

import { useState } from "react";
import Link from "next/link";

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

const EVENT_COLORS: Record<string, string> = {
  USER_REGISTERED:        "text-blue-400",
  USER_LOGIN:             "text-blue-300",
  EXAM_CREATED:           "text-purple-400",
  EXAM_ACTIVATED:         "text-emerald-400",
  EXAM_CLOSED:            "text-amber-400",
  EXAM_FINALIZED:         "text-purple-300",
  SUBMISSION_RECEIVED:    "text-sky-400",
  RESULT_RELEASED:        "text-emerald-300",
  KEY_SHARE_SUBMITTED:    "text-orange-400",
};

function eventColor(eventType: string): string {
  return EVENT_COLORS[eventType] ?? "text-slate-400";
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [firstInvalid, setFirstInvalid] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  async function loadAudit(verify: boolean = false) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/audit${verify ? "?verify=true" : ""}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
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
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <span className="text-sm font-bold text-white">Audit Hash Chain</span>
              <span className="ml-2 text-[10px] font-mono text-slate-500">SHA-256 · Ed25519</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAudit(false)}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-xs transition-colors"
            >
              {loading ? "Loading…" : "Load Log"}
            </button>
            <button
              onClick={() => loadAudit(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Verify Chain
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-2">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.75l-6.93-12A2 2 0 0010.18 4.25L3.25 16.25A2 2 0 005.07 19z" />
            </svg>
            {error}
          </div>
        )}

        {/* Chain verification result banner */}
        {chainValid !== null && (
          <div className={`p-4 border rounded-xl flex items-start gap-3 ${
            chainValid
              ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/8 border-red-500/20 text-red-400"
          }`}>
            {chainValid ? (
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.75l-6.93-12A2 2 0 0010.18 4.25L3.25 16.25A2 2 0 005.07 19z" />
              </svg>
            )}
            <div>
              <p className="font-semibold text-sm">
                {chainValid
                  ? "Chain integrity VALID"
                  : `Chain integrity INVALID — first broken link at entry #${firstInvalid}`}
              </p>
              <p className="text-xs opacity-70 mt-0.5">
                {chainValid
                  ? "All SHA-256 parent hashes and Ed25519 signatures have been verified"
                  : "Hash or signature mismatch detected — potential tamper event"}
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {entries.length === 0 && !loading && !error && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <p className="text-slate-300 font-medium mb-1">No entries loaded</p>
            <p className="text-slate-500 text-sm">Click <strong className="text-slate-400">Load Log</strong> to fetch the audit chain, or <strong className="text-slate-400">Verify Chain</strong> to load and verify at once.</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-800 last:border-0">
                <div className="w-6 h-3 bg-slate-800 rounded animate-pulse" />
                <div className="w-32 h-3 bg-slate-800 rounded animate-pulse" />
                <div className="w-20 h-3 bg-slate-800 rounded animate-pulse" />
                <div className="flex-1 h-3 bg-slate-800 rounded animate-pulse" />
                <div className="w-24 h-3 bg-slate-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Log table */}
        {entries.length > 0 && !loading && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2rem_8rem_1fr_7rem_7rem_8rem] gap-2 px-4 py-2.5 bg-slate-800/60 border-b border-slate-700/60 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>#</span>
              <span>Event</span>
              <span>Actor / Exam</span>
              <span>Time</span>
              <span>Prev Hash</span>
              <span>Entry Hash</span>
            </div>

            {entries.map((entry, i) => {
              const isBroken = firstInvalid !== null && i >= firstInvalid;
              const isExp = expanded === entry.sequenceNo;

              return (
                <div key={entry.sequenceNo}>
                  <button
                    onClick={() => setExpanded(isExp ? null : entry.sequenceNo)}
                    className={`w-full grid grid-cols-[2rem_8rem_1fr_7rem_7rem_8rem] gap-2 px-4 py-3 border-b border-slate-800/60 text-left transition-colors text-xs ${
                      isBroken
                        ? "bg-red-900/15 hover:bg-red-900/25"
                        : "hover:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-slate-500 font-mono">{entry.sequenceNo}</span>
                    <span className={`font-medium truncate ${eventColor(entry.eventType)}`}>{entry.eventType.replace(/_/g, "_\u200b")}</span>
                    <span className="text-slate-400 font-mono truncate">
                      {entry.actorId ? entry.actorId.slice(0, 10) + "…" : "—"}
                      {entry.examId && <span className="ml-2 text-slate-600">{entry.examId.slice(0, 8)}…</span>}
                    </span>
                    <span className="text-slate-500 tabular-nums">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span className="font-mono text-slate-600 truncate">{entry.prevHash.slice(0, 10)}…</span>
                    <span className={`font-mono truncate ${isBroken ? "text-red-400" : "text-emerald-400"}`}>
                      {entry.entryHash.slice(0, 10)}…
                    </span>
                  </button>

                  {/* Expanded row — full hashes */}
                  {isExp && (
                    <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 space-y-2 text-[11px]">
                      <div className="grid grid-cols-[6rem_1fr] gap-2">
                        <span className="text-slate-500 font-medium">Full hash</span>
                        <code className="font-mono text-emerald-400 break-all select-all">{entry.entryHash}</code>
                      </div>
                      <div className="grid grid-cols-[6rem_1fr] gap-2">
                        <span className="text-slate-500 font-medium">Prev hash</span>
                        <code className="font-mono text-purple-400 break-all select-all">{entry.prevHash}</code>
                      </div>
                      <div className="grid grid-cols-[6rem_1fr] gap-2">
                        <span className="text-slate-500 font-medium">Signature</span>
                        <code className="font-mono text-blue-400 break-all select-all">{entry.auditSig.slice(0, 64)}…</code>
                      </div>
                      <div className="grid grid-cols-[6rem_1fr] gap-2">
                        <span className="text-slate-500 font-medium">Timestamp</span>
                        <span className="text-slate-300">{new Date(entry.timestamp).toISOString()}</span>
                      </div>
                      {Object.keys(entry.eventData).length > 0 && (
                        <div className="grid grid-cols-[6rem_1fr] gap-2">
                          <span className="text-slate-500 font-medium">Event data</span>
                          <code className="font-mono text-slate-400 break-all">{JSON.stringify(entry.eventData)}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Count */}
        {entries.length > 0 && (
          <p className="text-xs text-slate-600 text-right font-mono">{entries.length} entries loaded</p>
        )}
      </div>
    </div>
  );
}
