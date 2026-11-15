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

  const statCards = [
    {
      label: "Registered Identities",
      value: loading ? null : stats.userCount,
      sub: "Students · Examiners · Admins",
      color: "text-white",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      label: "Audit Chain Head",
      value: loading ? null : stats.auditEntryCount ? `#${stats.auditEntryCount}` : "0",
      sub: "SHA-256 hash chain · Ed25519 signed",
      color: "text-emerald-400",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
    {
      label: "Key Protocol",
      value: "2-of-3",
      sub: "Shamir Secret Sharing · Argon2id shares",
      color: "text-blue-400",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
    },
  ];

  const navItems = [
    {
      href: "/users",
      label: "User Management",
      desc: "Provision examiner and administrator accounts. Configure Argon2id credentials and issue TOTP seeds.",
      accent: "blue",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      href: "/audit",
      label: "Audit Hash Chain",
      desc: "Inspect tamper-evident logs, verify Ed25519 signatures, and validate SHA-256 hash continuity.",
      accent: "emerald",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      href: "/benchmarks",
      label: "Cryptographic Benchmarks",
      desc: "Live AES-256-GCM vs CBC and Argon2id vs PBKDF2 performance comparison.",
      accent: "purple",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ];

  const accentMap: Record<string, { border: string; text: string; bg: string }> = {
    blue:    { border: "hover:border-blue-500/40",    text: "group-hover:text-blue-400",    bg: "bg-blue-500/10 text-blue-400" },
    emerald: { border: "hover:border-emerald-500/40", text: "group-hover:text-emerald-400", bg: "bg-emerald-500/10 text-emerald-400" },
    purple:  { border: "hover:border-purple-500/40",  text: "group-hover:text-purple-400",  bg: "bg-purple-500/10 text-purple-400" },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/20 text-red-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <div>
              <span className="text-sm font-bold text-white">System Administration</span>
              <span className="ml-2 text-[10px] font-mono text-red-400 uppercase">admin</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/users" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Provision User
            </Link>
            <Link href="/dashboard" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── System health title ───────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-white">System Overview</h1>
          <p className="text-slate-400 text-sm mt-1">Cryptographic key management, audit integrity, and identity control</p>
        </div>

        {/* ── Stats grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{card.label}</span>
                <span className="text-slate-600">{card.icon}</span>
              </div>
              <p className={`text-3xl font-bold tracking-tight ${card.color}`}>
                {card.value === null ? (
                  <span className="inline-block w-10 h-7 bg-slate-800 rounded animate-pulse" />
                ) : card.value}
              </p>
              <p className="text-[11px] text-slate-500 font-mono">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Security posture ─────────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Security Posture</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Transport", value: "TLS 1.3", status: "active" },
              { label: "Authentication", value: "Argon2id + TOTP + Ed25519", status: "active" },
              { label: "Session Encryption", value: "ECDH-P256 + HKDF + AES-256-GCM", status: "active" },
              { label: "Non-repudiation", value: "ECDSA-P256 submission signature", status: "active" },
              { label: "Batch integrity", value: "Merkle tree SHA-256", status: "active" },
              { label: "Audit chain", value: "SHA-256 hash chain + Ed25519", status: "active" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
                <span className="text-xs text-slate-400">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-300">{item.value}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Navigation cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {navItems.map((item) => {
            const a = accentMap[item.accent];
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex flex-col bg-slate-900 border border-slate-800 ${a.border} rounded-2xl p-5 transition-colors`}
              >
                <div className={`w-10 h-10 rounded-xl ${a.bg} flex items-center justify-center mb-4 flex-shrink-0`}>
                  {item.icon}
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className={`font-semibold text-white text-sm transition-colors ${a.text}`}>{item.label}</h3>
                  <svg className="w-4 h-4 text-slate-600 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
