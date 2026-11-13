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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const roleLinks: Record<string, { label: string; href: string; desc: string }[]> = {
    student: [
      { label: "My Examination Results", href: "/results", desc: "View released results with Merkle tree verification" },
    ],
    examiner: [
      { label: "Create Examination", href: "/exams/new", desc: "Initialize an exam with Shamir 2-of-3 threshold keys" },
      { label: "Manage Examinations", href: "/exams", desc: "Upload question papers, commit answer keys, and grade" },
    ],
    admin: [
      { label: "Administration Console", href: "/admin", desc: "System identity, key ceremony, and audit overview" },
      { label: "Tamper-Evident Audit Chain", href: "/audit", desc: "View and verify SHA-256 hash chain and Ed25519 signatures" },
      { label: "Cryptographic Benchmarks", href: "/benchmarks", desc: "Live AES-GCM and Argon2id execution benchmarks" },
      { label: "User Provisioning", href: "/admin/users", desc: "Provision examiners and administrative accounts" },
    ],
    hod: [
      { label: "Tamper-Evident Audit Chain", href: "/audit", desc: "Verify cryptographic audit chain continuity" },
      { label: "Examinations Overview", href: "/exams", desc: "Departmental overview of all examinations" },
    ],
  };

  const userRole = user?.role ?? "student";
  const links = roleLinks[userRole] ?? roleLinks.student;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-gray-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase font-mono">
                {userRole}
              </span>
              <span className="text-xs text-gray-500 font-mono">CNS Secure Exam System</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Welcome, {user?.name || user?.usn || "User"}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              USN: <span className="font-mono text-gray-300">{user?.usn || "Authenticated"}</span> · Role: {userRole}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 rounded-lg text-sm transition"
          >
            Sign Out
          </button>
        </div>

        {/* Security Status Box */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5 flex items-start sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 text-xl flex-shrink-0">
            🛡️
          </div>
          <div className="flex-1">
            <p className="text-green-400 text-sm font-semibold">Cryptographically Verified Session Active</p>
            <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">
              Authenticated via Argon2id password hash, time-stepped TOTP (RFC 6238), and browser Ed25519 session binding.
            </p>
          </div>
        </div>

        {/* Student View: Available / Enrolled Examinations */}
        {userRole === "student" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Your Examinations</h2>
              <button
                onClick={loadDashboardData}
                className="text-xs text-blue-400 hover:text-blue-300 transition"
              >
                Refresh
              </button>
            </div>

            {studentExams.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-400">
                <p className="font-medium text-white mb-1">No Active Examinations Scheduled</p>
                <p className="text-sm text-gray-500">
                  When an examiner activates a scheduled examination, it will appear here with an option to start a secure ECDH session.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {studentExams.map((ex) => (
                  <div
                    key={ex.id}
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-gray-700 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white text-base">{ex.title}</h3>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            ex.status === "active"
                              ? "bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse"
                              : ex.status === "scheduled"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-gray-800 text-gray-400"
                          }`}
                        >
                          {ex.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{ex.description || "No description provided."}</p>
                      <p className="text-xs text-gray-500 font-mono">
                        Duration: {ex.durationMins} mins · Window closes: {new Date(ex.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <div>
                      {ex.hasSubmitted ? (
                        <div className="text-right">
                          <span className="inline-block px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-semibold mb-2">
                            ✓ Submitted
                          </span>
                          <div>
                            <Link
                              href={`/results/${ex.id}`}
                              className="text-xs text-blue-400 hover:text-blue-300 transition"
                            >
                              View Results →
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={`/exam/${ex.id}`}
                          className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-md shadow-blue-600/20"
                        >
                          Start Secure Session →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Action Navigation Cards */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white">System Operations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 transition shadow-sm"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">
                    {link.label}
                  </h3>
                  <span className="text-gray-500 group-hover:text-blue-400 transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{link.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
