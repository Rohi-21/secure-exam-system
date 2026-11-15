"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="Examination Results & Cryptographic Proofs"
          description="Access evaluated examination records, authenticated examiner digital signatures, and independent client-side Merkle inclusion proofs."
          backHref="/dashboard"
          backLabel="Back to Portal Hub"
        >
          {error && (
            <div className="mb-6 p-4 bg-red-950/50 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Loading evaluation records…</p>
              </div>
            ) : exams.length === 0 ? (
              <EmptyState
                title="No Evaluation Records Available"
                description="When your examiners evaluate and finalize completed assessments, verified results with mathematical inclusion proofs will appear here."
                actionLabel="Return to Hub"
                onAction={() => router.push("/dashboard")}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {exams.map((ex) => (
                  <Card key={ex.id} hover className="border-slate-800/80">
                    <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-base font-semibold text-slate-100">
                            {ex.title}
                          </h3>
                          <Badge
                            variant={
                              ex.status === "finalized"
                                ? "success"
                                : ex.hasSubmitted
                                ? "warning"
                                : "default"
                            }
                            size="sm"
                          >
                            {ex.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                          {ex.description || "Comprehensive cryptographic assessment."}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
                          <span>Duration: {ex.durationMins} min</span>
                          {ex.submittedAt && (
                            <>
                              <span>&bull;</span>
                              <span>
                                Submitted: {new Date(ex.submittedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 w-full sm:w-auto">
                        {ex.status === "finalized" ? (
                          <Link href={`/results/${ex.id}`} className="block w-full sm:w-auto">
                            <Button variant="primary" size="md" className="w-full sm:w-auto">
                              View Verified Results &amp; Proof →
                            </Button>
                          </Link>
                        ) : ex.hasSubmitted ? (
                          <Badge variant="warning" size="md">
                            Pending Batch Evaluation
                          </Badge>
                        ) : (
                          <Badge variant="default" size="md">
                            Exam Not Submitted
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
