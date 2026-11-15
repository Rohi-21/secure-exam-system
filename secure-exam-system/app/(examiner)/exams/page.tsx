"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";

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
        return <Badge variant="default" size="sm">Draft</Badge>;
      case "scheduled":
        return <Badge variant="info" size="sm">Scheduled</Badge>;
      case "active":
        return <Badge variant="success" dot size="sm">Active</Badge>;
      case "closed":
        return <Badge variant="warning" size="sm">Closed (Pending)</Badge>;
      case "finalized":
        return <Badge variant="purple" size="sm">Finalized</Badge>;
      default:
        return <Badge variant="default" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="Examination Administration"
          description="Manage question encryption envelopes, configure Shamir (2-of-3) trustee ceremonies, and publish tamper-proof Merkle results."
          backHref="/dashboard"
          backLabel="Portal Hub"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadExams}
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                }
              >
                Refresh
              </Button>
              <Link href="/exams/new">
                <Button
                  variant="primary"
                  size="sm"
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  }
                >
                  Create Examination
                </Button>
              </Link>
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

          {loading ? (
            <div className="text-center py-20 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-mono">Loading examination registry…</p>
            </div>
          ) : exams.length === 0 ? (
            <EmptyState
              title="No Examinations Created"
              description="Initialize a new examination with AES-256-GCM envelope encryption and Shamir (2-of-3) trustee password shares."
              actionLabel="Create First Examination"
              onAction={() => router.push("/exams/new")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Examination</TableHead>
                  <TableHead>Lifecycle State</TableHead>
                  <TableHead>Schedule &amp; Duration</TableHead>
                  <TableHead className="text-center">Questions</TableHead>
                  <TableHead className="text-center">Submissions</TableHead>
                  <TableHead>Trustee Quorum</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-100 text-sm">{ex.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        By {ex.createdByName || "Examiner"}
                      </div>
                    </TableCell>

                    <TableCell>{getStatusBadge(ex.status)}</TableCell>

                    <TableCell>
                      <div className="text-xs font-mono tabular-nums text-slate-300">
                        {new Date(ex.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {ex.durationMins} minutes allocated
                      </div>
                    </TableCell>

                    <TableCell className="text-center font-mono font-semibold text-slate-100 tabular-nums">
                      {ex.questionCount}
                    </TableCell>

                    <TableCell className="text-center">
                      <span className="font-mono font-semibold text-blue-400 tabular-nums">
                        {ex.submissionCount}
                      </span>
                      {ex.enrollmentCount > 0 && (
                        <span className="text-slate-400 text-[11px] ml-1 font-mono">
                          / {ex.enrollmentCount}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="purple" size="sm">
                        Shamir 2-of-3
                      </Badge>
                      <div className="text-[11px] text-slate-400 mt-1 font-mono">
                        {ex.keyShareCount} of 3 shares enrolled
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <Link href={`/exams/${ex.id}`}>
                        <Button variant="outline" size="sm">
                          Manage →
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
