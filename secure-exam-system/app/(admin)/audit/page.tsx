"use client";
/**
 * Admin Audit Log Page — /admin/audit
 * Displays the tamper-evident audit chain with chain verification.
 */

import { useState } from "react";

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
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Log</h1>
            <p className="text-gray-400 text-sm">Tamper-evident SHA-256 hash chain with Ed25519 signatures</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => loadAudit(false)} disabled={loading}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors">
              {loading ? "Loading…" : "Load Log"}
            </button>
            <button onClick={() => loadAudit(true)} disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors">
              Verify Chain
            </button>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

        {/* Chain validity banner */}
        {chainValid !== null && (
          <div className={`mb-4 p-3 border rounded-lg text-sm flex items-center gap-2 ${
            chainValid
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            {chainValid ? "✓ Chain integrity VALID — all hashes and signatures verified" :
              `✗ Chain integrity INVALID — first invalid entry at sequence #${firstInvalid}`}
          </div>
        )}

        {/* Log table */}
        {entries.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-800 text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Exam</th>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Hash</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.sequenceNo} className={`border-t border-gray-800 hover:bg-gray-800/50 ${
                    firstInvalid !== null && i >= firstInvalid ? "bg-red-900/20" : ""
                  }`}>
                    <td className="px-3 py-2 text-gray-500 font-mono">{e.sequenceNo}</td>
                    <td className="px-3 py-2 text-blue-300 font-medium">{e.eventType}</td>
                    <td className="px-3 py-2 text-gray-400 font-mono">{e.actorId?.slice(0, 8) ?? "—"}…</td>
                    <td className="px-3 py-2 text-gray-400 font-mono">{e.examId?.slice(0, 8) ?? "—"}…</td>
                    <td className="px-3 py-2 text-gray-400">{new Date(e.timestamp).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 text-green-400 font-mono">{e.entryHash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length === 0 && !loading && !error && (
          <div className="text-center text-gray-500 mt-12">Click &quot;Load Log&quot; to view the audit chain.</div>
        )}
      </div>
    </div>
  );
}
