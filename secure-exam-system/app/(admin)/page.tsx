"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function getToken(): string {
  return (window as typeof window & { __accessToken?: string }).__accessToken ?? "";
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState({
    userCount: 0,
    examCount: 0,
    auditEntryCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [usersRes, auditRes] = await Promise.all([
          fetch("/api/admin/users", { credentials: "include" }),
          fetch("/api/audit?limit=1", { credentials: "include" }),
        ]);

        if (usersRes.status === 401 || usersRes.status === 403) {
          router.push("/login");
          return;
        }

        const usersData = await usersRes.json();
        const auditData = await auditRes.json();

        setStats({
          userCount: usersData.users?.length ?? 0,
          examCount: 0,
          auditEntryCount: auditData.totalCount ?? auditData.entries?.length ?? 0,
        });
      } catch (err) {
        console.error("Failed to load admin stats:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-gray-800 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">System Administration</h1>
            <p className="text-gray-400 text-sm mt-1">
              Cryptographic Key Ceremony, Tamper-Evident Audit Verification & Identity Management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/users"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-md shadow-blue-600/20"
            >
              + Provision Staff / User
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition"
            >
              My Dashboard
            </Link>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Registered Identities</p>
            <p className="text-3xl font-extrabold mt-2 text-white">
              {loading ? "…" : stats.userCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">Students, Examiners & Admins</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Audit Chain Head</p>
            <p className="text-3xl font-extrabold mt-2 text-green-400">
              {loading ? "…" : stats.auditEntryCount ? `#${stats.auditEntryCount}` : "Active"}
            </p>
            <p className="text-xs text-gray-500 mt-1">SHA-256 Hash Chain · Ed25519 Signed</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Key Protocol</p>
            <p className="text-2xl font-bold mt-2 text-blue-400">Shamir (2-of-3)</p>
            <p className="text-xs text-gray-500 mt-1">Argon2id Encrypted Trustee Shares</p>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/admin/users"
            className="group block bg-gray-900 border border-gray-800 hover:border-blue-500/50 rounded-2xl p-6 transition-all shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">User Management</h3>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
              Provision examiner and administrator accounts, configure Argon2id credentials, and issue TOTP MFA seeds.
            </p>
          </Link>

          <Link
            href="/audit"
            className="group block bg-gray-900 border border-gray-800 hover:border-green-500/50 rounded-2xl p-6 transition-all shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-green-600/20 text-green-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors">Audit Hash Chain</h3>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
              Inspect tamper-evident cryptographic audit logs, verify Ed25519 signatures, and validate hash continuity.
            </p>
          </Link>

          <Link
            href="/benchmarks"
            className="group block bg-gray-900 border border-gray-800 hover:border-purple-500/50 rounded-2xl p-6 transition-all shadow-md"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">Cryptographic Benchmarks</h3>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
              Run live AES-256-GCM vs CBC benchmarks and calibrate Argon2id vs PBKDF2 memory and computational costs.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
