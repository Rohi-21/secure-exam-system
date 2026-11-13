"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ExamResultSummary {
  id: string;
  title: string;
  description: string;
  durationMins: number;
  status: string;
  hasSubmitted: boolean;
  submittedAt: string | null;
}

export default function StudentResultsListPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadExams() {
      try {
        const res = await fetch("/api/exam", { credentials: "include" });
        if (res.status === 401 || res.status === 403) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        setExams(data.exams ?? []);
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    loadExams();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between pb-6 border-b border-gray-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard" className="text-gray-400 hover:text-gray-300 text-sm">
                ← Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Examination Results</h1>
            <p className="text-gray-400 text-sm mt-1">
              Verified evaluation records, digital examiner attestation, and Merkle inclusion proofs.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading result records…</div>
          ) : exams.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-400">
              No examination records found.
            </div>
          ) : (
            exams.map((ex) => (
              <div
                key={ex.id}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-gray-700 transition"
              >
                <div>
                  <h3 className="font-bold text-white text-base">{ex.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{ex.description || "No description."}</p>
                  <p className="text-xs text-gray-500 mt-1 font-mono">
                    Status: <span className="uppercase text-blue-400">{ex.status}</span>
                    {ex.submittedAt && (
                      <span className="ml-3 text-gray-400">
                        Submitted: {new Date(ex.submittedAt).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  {ex.status === "finalized" ? (
                    <Link
                      href={`/results/${ex.id}`}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-md shadow-blue-600/20"
                    >
                      View Verified Results →
                    </Link>
                  ) : ex.hasSubmitted ? (
                    <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg">
                      Pending Batch Finalization
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg">
                      Not Submitted
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
