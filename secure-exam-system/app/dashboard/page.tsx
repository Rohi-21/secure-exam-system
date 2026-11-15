"use client";

/**
 * Role-based Dashboard — /dashboard
 * Unified navigation portal for students, examiners, HODs, and administrators.
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

interface UserInfo {
  id: string;
  name: string;
  role: "student" | "examiner" | "admin" | "hod";
  usn: string;
  email: string;
}

interface StudentExam {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  durationMins: number;
  status: string;
  questionCount: number;
  isEnrolled: boolean;
  hasSubmitted: boolean;
  submittedAt: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentExams, setStudentExams] = useState<StudentExam[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser({
          id: payload.userId ?? payload.sub,
          name: payload.name ?? "",
          role: payload.role,
          usn: payload.usn ?? "",
          email: payload.email ?? "",
        });
      } catch {}
    }

    loadDashboardData();
  }, [router]);

  async function loadDashboardData() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/exam", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (data.exams) {
        setStudentExams(data.exams);
      }
    } catch (err) {
      console.error("[dashboard] load failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const userRole = user?.role ?? "student";

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success" dot size="sm">Active Session</Badge>;
      case "scheduled":
        return <Badge variant="info" size="sm">Scheduled</Badge>;
      case "closed":
        return <Badge variant="default" size="sm">Closed</Badge>;
      default:
        return <Badge variant="default" size="sm">{status}</Badge>;
    }
  };

  const actionLinks = {
    student: [
      {
        label: "My Results & Proofs",
        href: "/results",
        desc: "Inspect scored submissions and evaluate client-side Merkle inclusion proofs.",
        icon: (
          <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        label: "Immutable Audit Chain",
        href: "/audit",
        desc: "Verify tamper-evident event blocks and cryptographic Ed25519 signatures.",
        icon: (
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        ),
      },
    ],
    examiner: [
      {
        label: "Create Examination",
        href: "/exams/new",
        desc: "Initialize exam with Shamir 2-of-3 threshold keys and commit-reveal answer salt.",
        icon: (
          <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        ),
      },
      {
        label: "Manage Examinations",
        href: "/exams",
        desc: "Question paper encryption, trustee quorum ceremonies, and Merkle release.",
        icon: (
          <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
        ),
      },
    ],
    admin: [
      {
        label: "System Overview",
        href: "/admin",
        desc: "System metrics, user provisioning, and operational posture.",
        icon: (
          <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
          </svg>
        ),
      },
      {
        label: "User Management",
        href: "/users",
        desc: "Provision examiners, reset credentials, and audit registered device keys.",
        icon: (
          <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        ),
      },
      {
        label: "Audit Hash Chain",
        href: "/audit",
        desc: "Explore immutable block ledger, parent hashes, and Ed25519 non-repudiation.",
        icon: (
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        ),
      },
      {
        label: "Cryptographic Benchmarks",
        href: "/benchmarks",
        desc: "Live performance comparisons: AES-256-GCM vs CBC, Argon2id vs PBKDF2.",
        icon: (
          <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        ),
      },
    ],
    hod: [
      {
        label: "Departmental Examinations",
        href: "/exams",
        desc: "Academic oversight of all active, scheduled, and completed assessments.",
        icon: (
          <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
        ),
      },
      {
        label: "Audit Hash Chain",
        href: "/audit",
        desc: "Institutional compliance audit and tamper detection.",
        icon: (
          <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
        ),
      },
    ],
  };

  const currentLinks = actionLinks[userRole as keyof typeof actionLinks] ?? actionLinks.student;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer>
          {/* Welcome Institutional Banner */}
          <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-blue-950/40 border border-slate-800 shadow-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <Badge variant={userRole === "admin" ? "danger" : userRole === "examiner" ? "purple" : "info"} size="sm">
                  {userRole.toUpperCase()} PORTAL
                </Badge>
                {user?.usn && (
                  <span className="text-xs font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60">
                    {user.usn}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
                Welcome back, {user?.name || user?.usn || "Candidate"}
              </h1>
              <p className="text-xs text-slate-400 max-w-xl">
                Authenticated via Argon2id credentials and non-exportable WebCrypto hardware key binding. All test activity is protected by forward-secret ephemeral session keys.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>WebCrypto Active</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={refreshing}
                onClick={loadDashboardData}
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                }
              >
                Refresh
              </Button>
            </div>
          </div>

          {/* Student Examinations Section */}
          {userRole === "student" && (
            <div className="space-y-4 mb-10">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Assigned Examinations
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click an active examination to initiate the ECDH key exchange session.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {studentExams.length} {studentExams.length === 1 ? "Exam" : "Exams"} Total
                </span>
              </div>

              {studentExams.length === 0 ? (
                <EmptyState
                  title="No Examinations Currently Available"
                  description="When an examiner schedules or activates an examination for your course, it will appear here with secure cryptographic session access."
                  actionLabel="Check for Updates"
                  onAction={loadDashboardData}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {studentExams.map((exam) => (
                    <Card key={exam.id} hover className="border-slate-800/80">
                      <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                        <div className="space-y-2 min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="text-base font-semibold text-slate-100">
                              {exam.title}
                            </h3>
                            {getStatusBadge(exam.status)}
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                            {exam.description || "Comprehensive cryptographic assessment."}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>{exam.durationMins} Minutes</span>
                            </span>
                            <span>&bull;</span>
                            <span>
                              Closes: {new Date(exam.endTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 w-full sm:w-auto">
                          {exam.hasSubmitted ? (
                            <div className="flex flex-col sm:items-end gap-2">
                              <Badge variant="success" size="md">
                                Submitted & Verified
                              </Badge>
                              <Link href={`/results/${exam.id}`}>
                                <Button variant="outline" size="sm">
                                  View Result & Proof →
                                </Button>
                              </Link>
                            </div>
                          ) : (
                            <Link href={`/exam/${exam.id}`} className="block w-full sm:w-auto">
                              <Button
                                variant="primary"
                                size="md"
                                className="w-full sm:w-auto shadow-md shadow-blue-900/30"
                                icon={
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                  </svg>
                                }
                              >
                                Start Secure Session
                              </Button>
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Operations & Navigation Section */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-100 pb-2 border-b border-slate-800/60">
              {userRole === "student" ? "Verification & Security Tools" : "Institutional Workflows"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentLinks.map((link) => (
                <Link key={link.href} href={link.href} className="group">
                  <Card hover className="h-full border-slate-800/80">
                    <CardContent className="p-5 flex items-start gap-4">
                      <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60 shrink-0 group-hover:border-blue-500/50 transition-colors">
                        {link.icon}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                            {link.label}
                          </h3>
                          <svg className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {link.desc}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
