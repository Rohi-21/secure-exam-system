"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function NewExamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function getLocalISOString(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const now = new Date();
  const defaultStart = getLocalISOString(new Date(now.getTime() + 10 * 60000));
  const defaultEnd = getLocalISOString(new Date(now.getTime() + 120 * 60000));

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

    if (!form.title.trim()) {
      setError("Please enter an examination title.");
      return;
    }

    const startMs = new Date(form.startTime).getTime();
    const endMs = new Date(form.endTime).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      setError("Please enter valid start and end dates.");
      return;
    }

    if (endMs <= startMs) {
      setError("Examination end time must be after the start time.");
      return;
    }

    const durationMs = Number(form.durationMins) * 60000;
    if (endMs - startMs < durationMs) {
      setError(`The examination window (${Math.round((endMs - startMs) / 60000)} mins) cannot be shorter than the exam duration (${form.durationMins} mins).`);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/exam/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="Create New Examination"
          description="Initialize Exam Master Key (ExamKEK) split into 3 Shamir polynomial shares under 2-of-3 threshold quorum."
          backHref="/exams"
          backLabel="All Examinations"
          maxWidth="narrow"
        >
          {error && (
            <div className="mb-6 p-4 bg-red-950/50 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleCreateExam} className="space-y-6">
            {/* Step 1: Basic Details Card */}
            <Card className="border-slate-800 shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>1. Assessment Specification</CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Course title, duration, and delivery availability window.
                  </p>
                </div>
                <Badge variant="info" size="sm">Step 1</Badge>
              </CardHeader>

              <CardContent className="space-y-4">
                <Input
                  label="Examination Title"
                  placeholder="e.g. CNS Capstone Assessment — Network Cryptography"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Candidate Instructions &amp; Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Instructions regarding permitted tools, time constraints, and academic integrity policies."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/80 focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={form.durationMins}
                      onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Session Opens
                    </label>
                    <input
                      type="datetime-local"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Session Closes
                    </label>
                    <input
                      type="datetime-local"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      required
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Shamir Secret Sharing Card */}
            <Card className="border-slate-800 shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>2. Shamir Secret Sharing Quorum</CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Threshold $k=2, n=3$ polynomial key split with Argon2id envelope protection.
                  </p>
                </div>
                <Badge variant="purple" size="sm">Zero-Knowledge</Badge>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="p-3.5 bg-blue-950/40 border border-blue-800/60 rounded-xl text-xs text-blue-300 flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                  <p className="leading-relaxed">
                    The 256-bit Exam Master Key (ExamKEK) will be generated in volatile RAM and split into 3 Shamir polynomial shares. Each share is encrypted under an individual trustee password using Argon2id key derivation and AES-256-GCM. Any 2 shares can reconstruct the key to decrypt questions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Trustee 1 Passphrase"
                    value={form.trusteePass1}
                    onChange={(e) => setForm({ ...form, trusteePass1: e.target.value })}
                    required
                    helperText="Head of Department"
                  />

                  <Input
                    label="Trustee 2 Passphrase"
                    value={form.trusteePass2}
                    onChange={(e) => setForm({ ...form, trusteePass2: e.target.value })}
                    required
                    helperText="Chief Examiner"
                  />

                  <Input
                    label="Trustee 3 Passphrase"
                    value={form.trusteePass3}
                    onChange={(e) => setForm({ ...form, trusteePass3: e.target.value })}
                    required
                    helperText="External Auditor"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link href="/exams">
                <Button variant="ghost" size="md">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={loading}
              >
                Generate Shamir Shares &amp; Create Exam →
              </Button>
            </div>
          </form>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
