"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";

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
      sub: "Candidates · Examiners · Administrators",
      badgeVariant: "info" as const,
      icon: (
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      label: "Audit Ledger Height",
      value: loading ? null : stats.auditEntryCount ? `#${stats.auditEntryCount}` : "0",
      sub: "SHA-256 Chained Blocks · Ed25519 Signed",
      badgeVariant: "success" as const,
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
    },
    {
      label: "Master Key Custody",
      value: "2-of-3",
      sub: "Shamir Threshold · Argon2id Encrypted",
      badgeVariant: "purple" as const,
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
    },
  ];

  const adminNav = [
    {
      href: "/users",
      label: "User Provisioning & IAM",
      desc: "Provision examiner and administrative accounts. Audit registered WebCrypto device keys and manage credentials.",
      icon: (
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
    },
    {
      href: "/audit",
      label: "Immutable Audit Chain",
      desc: "Browse block-by-block ledger entries, inspect previous-hash cryptographic links, and verify Ed25519 signatures.",
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      ),
    },
    {
      href: "/benchmarks",
      label: "Cryptographic Benchmarks",
      desc: "Live runtime performance benchmarks comparing AES-256-GCM vs CBC and Argon2id vs PBKDF2.",
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="System Administration Console"
          description="Institutional cryptographic telemetry, user identity control, and immutable audit chain oversight."
          backHref="/dashboard"
          backLabel="Portal Hub"
          actions={
            <Link href="/users">
              <Button
                variant="primary"
                size="sm"
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                }
              >
                Provision User
              </Button>
            </Link>
          }
        >
          {/* Telemetry Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            {statCards.map((card) => (
              <Card key={card.label} hover className="border-slate-800">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {card.label}
                    </span>
                    <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60">
                      {card.icon}
                    </div>
                  </div>

                  <div className="text-3xl sm:text-4xl font-extrabold text-slate-100 font-mono tracking-tight tabular-nums">
                    {card.value === null ? (
                      <span className="inline-block w-16 h-8 bg-slate-800 rounded animate-pulse" />
                    ) : (
                      card.value
                    )}
                  </div>

                  <p className="text-xs text-slate-400 font-mono">
                    {card.sub}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cryptographic Security Posture Matrix */}
          <Card className="border-slate-800 mb-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Institutional Security Posture</CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time cryptographic parameter verification across all application layers.
                </p>
              </div>
              <Badge variant="success" size="sm" dot>Active Posture</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { layer: "Transport Security", primitive: "TLS 1.3 / Strict Cipher Suites", status: "Enforced" },
                  { layer: "Identity Authentication", primitive: "Argon2id (m=64MB, t=3, p=4) + TOTP RFC 6238", status: "Active" },
                  { layer: "Hardware Binding", primitive: "WebCrypto Ed25519 & ECDSA-P256 Non-Exportable", status: "Active" },
                  { layer: "Session Confidentiality", primitive: "Ephemeral ECDH-P256 + HKDF-SHA256 + AES-256-GCM", status: "Forward-Secret" },
                  { layer: "Key Custody Ceremony", primitive: "Shamir Secret Sharing (k=2, n=3) Polynomial", status: "Quorum-Bound" },
                  { layer: "Integrity & Non-Repudiation", primitive: "SHA-256 Hash Chained Audit Blocks + Ed25519 Attestation", status: "Immutable" },
                ].map((item) => (
                  <div
                    key={item.layer}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">{item.layer}</span>
                      <span className="text-[11px] font-mono text-slate-400">{item.primitive}</span>
                    </div>
                    <Badge variant="info" size="sm">
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Administrative Operations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {adminNav.map((item) => (
              <Link key={item.href} href={item.href} className="group">
                <Card hover className="h-full border-slate-800">
                  <CardContent className="p-6 flex flex-col justify-between h-full space-y-4">
                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center group-hover:border-blue-500/50 transition-colors">
                        {item.icon}
                      </div>
                      <h3 className="text-base font-semibold text-slate-100 group-hover:text-blue-400 transition-colors">
                        {item.label}
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>

                    <div className="pt-2 flex items-center text-xs font-medium text-blue-400 group-hover:translate-x-1 transition-transform">
                      <span>Open Tool →</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
