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

export default function ExaminerExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadExams();
  }, []);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300">Draft</span>;
      case "scheduled":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">Scheduled</span>;
      case "active":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse">● Active</span>;
      case "closed":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Closed (Awaiting Grading)</span>;
      case "finalized":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">Finalized (Results Released)</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-400">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-gray-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-gray-400 hover:text-gray-300 text-sm">
                ← Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Examinations Management</h1>
            <p className="text-gray-400 text-sm mt-1">
              Shamir 2-of-3 threshold protected question papers, answer-key commitments & grading.
            </p>
          </div>
          <Link
            href="/exams/new"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-lg shadow-blue-600/20"
          >
            + Create New Examination
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Exams Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">All Examinations ({exams.length})</h2>
            <button
              onClick={loadExams}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-800/60 text-xs uppercase text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-3.5">Exam Title</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Schedule & Duration</th>
                  <th className="px-6 py-3.5">Questions</th>
                  <th className="px-6 py-3.5">Submissions</th>
                  <th className="px-6 py-3.5">Key Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      Loading examinations…
                    </td>
                  </tr>
                ) : exams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No examinations created yet. Click "+ Create New Examination" to start.
                    </td>
                  </tr>
                ) : (
                  exams.map((ex) => (
                    <tr key={ex.id} className="hover:bg-gray-800/40 transition">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white">{ex.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Author: {ex.createdByName}</p>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(ex.status)}</td>
                      <td className="px-6 py-4 text-xs text-gray-400">
                        <div>{new Date(ex.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</div>
                        <div>Duration: {ex.durationMins} mins</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-medium">{ex.questionCount}</span> questions
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-medium text-blue-400">{ex.submissionCount}</span> submitted
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className="text-purple-400 font-mono">Shamir 2-of-3</span>
                        <div className="text-[11px] text-gray-500">3 trustee shares</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/exams/${ex.id}`}
                          className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition"
                        >
                          Manage →
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
