"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewExamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const now = new Date();
  const defaultStart = new Date(now.getTime() + 10 * 60000).toISOString().slice(0, 16);
  const defaultEnd = new Date(now.getTime() + 120 * 60000).toISOString().slice(0, 16);

  const [form, setForm] = useState({
    title: "",
    description: "",
    durationMins: 60,
    startTime: defaultStart,
    endTime: defaultEnd,
    trusteePass1: "TrusteeKeyAlpha@2026",
    trusteePass2: "TrusteeKeyBeta@2026",
    trusteePass3: "TrusteeKeyGamma@2026",
  });

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/exam/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          durationMins: Number(form.durationMins),
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
          trusteePasswords: [form.trusteePass1, form.trusteePass2, form.trusteePass3],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create examination");

      router.push(`/exams/${data.examId}`);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/exams" className="text-gray-400 hover:text-gray-300 text-sm">
              ← Examinations
            </Link>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Create Examination</h1>
          <p className="text-gray-400 text-sm mt-1">
            Initializes an Exam Master Key (ExamKEK) split into 3 Shamir shares (2-of-3 threshold).
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleCreateExam} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-2">
              1. Basic Examination Details
            </h2>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Examination Title
              </label>
              <input
                type="text"
                placeholder="e.g. CNS Capstone Assessment — Network Cryptography"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Description / Instructions
              </label>
              <textarea
                rows={3}
                placeholder="Optional instructions for candidates regarding examination protocol."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={form.durationMins}
                  onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Start Window
                </label>
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  End Window
                </label>
                <input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-800">
            <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-2">
              2. Shamir Secret Sharing (2-of-3 Threshold Key Ceremony)
            </h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              The 256-bit Exam Master Key (ExamKEK) will be generated in volatile memory and split into 3 Shamir polynomial
              shares. Each share is encrypted under an individual trustee password using Argon2id key derivation and AES-256-GCM.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Trustee 1 Passphrase</label>
                <input
                  type="text"
                  value={form.trusteePass1}
                  onChange={(e) => setForm({ ...form, trusteePass1: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Trustee 2 Passphrase</label>
                <input
                  type="text"
                  value={form.trusteePass2}
                  onChange={(e) => setForm({ ...form, trusteePass2: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Trustee 3 Passphrase</label>
                <input
                  type="text"
                  value={form.trusteePass3}
                  onChange={(e) => setForm({ ...form, trusteePass3: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
            <Link
              href="/exams"
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-semibold transition shadow-lg shadow-blue-600/20"
            >
              {loading ? "Generating Shamir Shares…" : "Create & Initialize ExamKEK →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
