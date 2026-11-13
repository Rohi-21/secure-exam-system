"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ExamSummary {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  durationMins: number;
  status: string;
  createdByName: string;
  questionCount: number;
  submissionCount: number;
  resultCount: number;
  keyShareCount: number;
  enrollmentCount: number;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",                      cls: "bg-slate-700/60 text-slate-300 border-slate-600" },
  scheduled: { label: "Scheduled",                  cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
  active:    { label: "● Active",                   cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  closed:    { label: "Closed — Awaiting Grading",  cls: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
  finalized: { label: "Finalized · Results Released", cls: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: "bg-slate-700 text-slate-400 border-slate-600" };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border font-mono ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function ExaminerExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { loadExams(); }, []);

  async function loadExams() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/exam", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load examinations");
      setExams(data.exams ?? []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <span className="text-sm font-bold text-white">Examinations</span>
              <span className="ml-2 text-[10px] font-mono text-slate-500">Shamir 2-of-3 · AES-256-GCM</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadExams} className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1">
              ↻ Refresh
            </button>
            <Link
              href="/exams/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-blue-600/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Examination
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-white">Examination Management</h1>
          <p className="text-slate-400 text-sm mt-1">Shamir 2-of-3 threshold key ceremony · AES-256-GCM encrypted question papers · answer-key commitments</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Table card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              All Examinations
              {!loading && <span className="ml-2 text-slate-500 font-normal">({exams.length})</span>}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-800/40 border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Exam</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Schedule</th>
                  <th className="px-5 py-3 text-center">Qs</th>
                  <th className="px-5 py-3 text-center">Submitted</th>
                  <th className="px-5 py-3">Key Ceremony</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-5 py-4">
                          <div className="h-3 bg-slate-800 rounded animate-pulse" style={{ width: j === 0 ? "80%" : "60%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : exams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="inline-flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <p className="text-slate-400 font-medium">No examinations yet</p>
                        <p className="text-slate-500 text-xs">Create your first exam to begin the Shamir key ceremony</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  exams.map((ex) => (
                    <tr key={ex.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white text-sm">{ex.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{ex.createdByName}</p>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={ex.status} />
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400">
                        <div className="tabular-nums">{new Date(ex.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</div>
                        <div className="text-slate-500 mt-0.5">{ex.durationMins} min</div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="font-mono font-semibold text-white text-sm">{ex.questionCount}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="font-mono font-semibold text-blue-400 text-sm">{ex.submissionCount}</span>
                        {ex.enrollmentCount > 0 && (
                          <span className="text-slate-500 text-[10px] ml-1">/ {ex.enrollmentCount}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-purple-400">Shamir 2-of-3</span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {ex.keyShareCount}/3 shares held
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/exams/${ex.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                          Manage
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
