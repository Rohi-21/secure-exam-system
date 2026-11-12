"use client";
/**
 * Role-based Dashboard — /dashboard
 * Redirects to the correct role dashboard after checking JWT role claim.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }

    // Decode JWT payload (no verification needed — server validates on each API call)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser({ id: payload.sub, name: payload.name ?? "", role: payload.role, usn: payload.usn ?? "", email: payload.email ?? "" });
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return null;

  const roleLinks: Record<UserInfo["role"], { label: string; href: string; desc: string }[]> = {
    student: [
      { label: "My Exams", href: "/student/exams", desc: "View enrolled exams and start sessions" },
      { label: "My Results", href: `/student/results`, desc: "View released results with Merkle proofs" },
    ],
    examiner: [
      { label: "Create Exam", href: "/examiner/exams/new", desc: "Create a new exam with Shamir key setup" },
      { label: "My Exams", href: "/examiner/exams", desc: "Manage and conduct post-exam operations" },
    ],
    admin: [
      { label: "Audit Log", href: "/admin/audit", desc: "View and verify tamper-evident audit chain" },
      { label: "Benchmarks", href: "/admin/benchmarks", desc: "Cipher and KDF performance dashboard" },
      { label: "Users", href: "/admin/users", desc: "Manage system users and roles" },
    ],
    hod: [
      { label: "Audit Log", href: "/admin/audit", desc: "View and verify tamper-evident audit chain" },
      { label: "Exams", href: "/examiner/exams", desc: "Overview of all examinations" },
    ],
  };

  const links = roleLinks[user.role] ?? [];
  const roleColor = { student: "blue", examiner: "purple", admin: "red", hod: "orange" }[user.role];

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Welcome */}
        <div className="mb-8">
          <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-3 bg-${roleColor}-500/20 text-${roleColor}-400 capitalize`}>
            {user.role}
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome, {user.name || user.usn}</h1>
          <p className="text-gray-400 text-sm mt-1">{user.email} · {user.usn}</p>
        </div>

        {/* Security status */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-green-400 text-lg">🔒</span>
          <div>
            <p className="text-green-400 text-sm font-medium">Secure session active</p>
            <p className="text-gray-400 text-xs">JWT access token · Ed25519 device binding · TOTP verified</p>
          </div>
        </div>

        {/* Role links */}
        <div className="space-y-3">
          {links.map((link) => (
            <a key={link.href} href={link.href}
              className="block bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-2xl p-4 transition-colors group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium text-sm group-hover:text-blue-400 transition-colors">{link.label}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{link.desc}</p>
                </div>
                <span className="text-gray-600 group-hover:text-gray-400 transition-colors">→</span>
              </div>
            </a>
          ))}
        </div>

        {/* Crypto info panel */}
        <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Active Security Mechanisms</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Cipher", "AES-256-GCM"],
              ["KDF", "Argon2id (RFC 9106)"],
              ["Key Exchange", "ECDH-P256 + HKDF"],
              ["Signatures", "Ed25519 + ECDSA-P256"],
              ["Key Custody", "Shamir 2-of-3 SSS"],
              ["Audit", "SHA-256 Hash Chain"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-gray-500">{k}</span>
                <span className="text-blue-300 font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
