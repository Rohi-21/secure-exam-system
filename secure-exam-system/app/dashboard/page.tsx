"use client";
/**
 * Role-based Dashboard — /dashboard
 * Unified navigation portal for students, examiners, HODs, and administrators.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const [examsLoading, setExamsLoading] = useState(false);

  useEffect(() => {
    // Attempt to parse access token or check profile
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
      } catch {
        // Continue to server check
      }
    }

    // Always fetch /api/exam to test auth cookie and load role data
    loadDashboardData();
  }, [router]);

  async function loadDashboardData() {
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
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    (window as typeof window & { __accessToken?: string }).__accessToken = "";
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const roleLinks: Record<string, { label: string; href: string; desc: string; icon: string }[]> = {
    student: [
      { label: "My Results", href: "/results", desc: "View results with Merkle inclusion proofs", icon: "📊" },
    ],
    examiner: [
      { label: "Create Examination", href: "/exams/new", desc: "Initialize exam with Shamir 2-of-3 threshold keys", icon: "✏️" },
      { label: "Manage Examinations", href: "/exams", desc: "Upload papers, commit answer keys, finalize results", icon: "📋" },
    ],
    admin: [
      { label: "Administration Console", href: "/admin", desc: "System identity, key ceremony, audit overview", icon: "⚙️" },
      { label: "Audit Hash Chain", href: "/audit", desc: "Verify SHA-256 chain integrity and Ed25519 signatures", icon: "🔗" },
      { label: "Benchmarks", href: "/benchmarks", desc: "Live AES-GCM and Argon2id execution benchmarks", icon: "📈" },
      { label: "User Provisioning", href: "/users", desc: "Provision examiners and administrative accounts", icon: "👤" },
    ],
    hod: [
      { label: "Audit Hash Chain", href: "/audit", desc: "Verify cryptographic audit chain continuity", icon: "🔗" },
      { label: "Examinations Overview", href: "/exams", desc: "Departmental overview of all examinations", icon: "📋" },
    ],
  };

  const userRole = user?.role ?? "student";
  const links = roleLinks[userRole] ?? roleLinks.student;
  const roleBadgeColor: Record<string, string> = {
    student: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    examiner: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    admin: "bg-red-500/15 text-red-400 border-red-500/25",
    hod: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Top Navigation ───────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🛡️</span>
            <div>
              <span className="text-white font-bold text-sm block">CNS Exam System</span>
              <span className="text-slate-500 text-[10px] font-mono">KLE Technological University</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border font-mono ${roleBadgeColor[userRole] ?? roleBadgeColor.student}`}>
              {userRole}
            </span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* ── Welcome Header ───────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {user?.name || user?.usn || "User"}
            </h1>
            {user?.usn && (
              <p className="text-slate-400 text-sm mt-0.5 font-mono">{user.usn}</p>
            )}
          </div>
          {/* Security indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 text-xs font-medium">Session Secured</span>
            <span className="text-slate-500 text-[10px] font-mono">Argon2id · TOTP · Ed25519</span>
          </div>
        </div>

        {/* ── Student Exam List ─────────────────────────────────────────────── */}
        {userRole === "student" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Your Examinations</h2>
              <button onClick={loadDashboardData} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                ↻ Refresh
              </button>
            </div>

            {studentExams.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                <p className="text-3xl mb-3">📋</p>
                <p className="font-semibold text-white mb-1">No Active Examinations</p>
                <p className="text-slate-400 text-sm">When an examiner activates an exam, it will appear here with a secure session option.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {studentExams.map((ex) => (
                  <div
                    key={ex.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-white text-base">{ex.title}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border font-mono ${
                          ex.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                            : ex.status === "scheduled"
                            ? "bg-blue-500/15 text-blue-400 border-blue-500/25"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}>
                          {ex.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{ex.description || "No description provided."}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {ex.durationMins} min · Closes {new Date(ex.endTime).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex-shrink-0">
                      {ex.hasSubmitted ? (
                        <div className="text-right space-y-1.5">
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            Submitted
                          </span>
                          <div>
                            <Link href={`/results/${ex.id}`} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                              View Result →
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={`/exam/${ex.id}`}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20"
                        >
                          🔐 Start Secure Session
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Role Navigation Cards ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white">
            {userRole === "student" ? "Quick Actions" : "System Operations"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-start gap-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition-colors"
              >
                <span className="text-2xl flex-shrink-0 mt-0.5">{link.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-white text-sm group-hover:text-blue-400 transition-colors">
                      {link.label}
                    </h3>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
