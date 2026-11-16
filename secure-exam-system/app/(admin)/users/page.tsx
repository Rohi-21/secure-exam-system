"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";

interface UserItem {
  id: string;
  usn: string;
  email: string;
  name: string;
  role: string;
  isLocked: boolean;
  hasEd25519Key: boolean;
  hasECDSAKey: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Provision modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    usn: "",
    email: "",
    name: "",
    password: "",
    targetRole: "examiner",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Post-provisioning TOTP modal state
  const [provisionedData, setProvisionedData] = useState<{
    user: { usn: string; name: string; role: string };
    totpSecret: string;
    totpUri: string;
    qrUrl: string;
  } | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch users");
      setUsers(data.users ?? []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!form.usn.trim()) {
      setFormError("Please enter a USN or staff identifier.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Please enter the user's full name.");
      return;
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (!form.password || form.password.length < 8) {
      setFormError("Temporary password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to provision user");

      const qr = await QRCode.toDataURL(data.totpUri);
      setProvisionedData({
        user: data.user,
        totpSecret: data.totpSecret,
        totpUri: data.totpUri,
        qrUrl: qr,
      });

      setShowModal(false);
      setForm({ usn: "", email: "", name: "", password: "", targetRole: "examiner" });
      loadUsers();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge variant="danger" size="sm">ADMIN</Badge>;
      case "hod":
        return <Badge variant="purple" size="sm">HOD</Badge>;
      case "examiner":
        return <Badge variant="info" size="sm">EXAMINER</Badge>;
      default:
        return <Badge variant="default" size="sm">STUDENT</Badge>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="Identity & Access Management (IAM)"
          description="Provision institutional examiner, HOD, and administrative roles. Audit registered WebCrypto hardware credentials and lock states."
          backHref="/admin"
          backLabel="Admin Console"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadUsers}
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                }
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowModal(true)}
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                }
              >
                Provision Account
              </Button>
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
              <p className="text-xs text-slate-400 font-mono">Loading identity directory…</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>USN / Identifier</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Official Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Hardware Device Keys</TableHead>
                  <TableHead>Account Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono font-medium text-slate-100">
                      {u.usn}
                    </TableCell>
                    <TableCell className="text-slate-200">{u.name}</TableCell>
                    <TableCell className="text-slate-400 font-mono text-xs">{u.email}</TableCell>
                    <TableCell>{getRoleBadge(u.role)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded border ${
                            u.hasEd25519Key
                              ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/80"
                              : "bg-slate-800 text-slate-500 border-slate-700/60"
                          }`}
                        >
                          Ed25519: {u.hasEd25519Key ? "✓" : "—"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded border ${
                            u.hasECDSAKey
                              ? "bg-blue-950/60 text-blue-400 border-blue-800/80"
                              : "bg-slate-800 text-slate-500 border-slate-700/60"
                          }`}
                        >
                          ECDSA: {u.hasECDSAKey ? "✓" : "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.isLocked ? (
                        <Badge variant="danger" size="sm">LOCKED</Badge>
                      ) : (
                        <Badge variant="success" size="sm">ACTIVE</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Provisioning Modal */}
          <Modal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            title="Provision Institutional Account"
            description="Create privileged faculty or auditor accounts protected with Argon2id and seed TOTP MFA."
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  onClick={(e) => handleProvision(e)}
                >
                  Provision Account
                </Button>
              </>
            }
          >
            {formError && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-800 text-red-300 rounded-lg text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleProvision} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Target Role</label>
                <select
                  value={form.targetRole}
                  onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="examiner">Examiner (Question author &amp; Shamir trustee)</option>
                  <option value="hod">HOD (Departmental governance &amp; auditor)</option>
                  <option value="admin">Administrator (Full security officer)</option>
                  <option value="student">Student (Candidate)</option>
                </select>
              </div>

              <Input
                label="USN / Staff Identifier"
                placeholder="e.g. EXAM-FACULTY-01"
                value={form.usn}
                onChange={(e) => setForm({ ...form, usn: e.target.value.toUpperCase() })}
                required
              />

              <Input
                label="Full Name"
                placeholder="Prof. John Doe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <Input
                label="Official University Email"
                type="email"
                placeholder="faculty@kletech.ac.in"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />

              <Input
                label="Temporary Password"
                type="password"
                placeholder="••••••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                helperText="Candidate will change on first login"
              />
            </form>
          </Modal>

          {/* Post-Provisioning TOTP Modal */}
          {provisionedData && (
            <Modal
              isOpen={Boolean(provisionedData)}
              onClose={() => setProvisionedData(null)}
              title="Account Provisioned Successfully"
              description="Share this one-time TOTP Authenticator credential setup with the account holder."
              footer={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setProvisionedData(null)}
                  className="w-full"
                >
                  Done &amp; Dismiss
                </Button>
              }
            >
              <div className="space-y-4 text-center">
                <div className="p-4 bg-white rounded-2xl shadow-xl inline-block mx-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={provisionedData.qrUrl}
                    alt="TOTP QR Code"
                    width={200}
                    height={200}
                    className="rounded-lg"
                  />
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-left font-mono space-y-1">
                  <div className="text-[11px] text-slate-400">TOTP Secret (Manual Entry):</div>
                  <div className="text-xs text-amber-300 font-bold select-all break-all">
                    {provisionedData.totpSecret}
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  Account assigned: <strong className="text-slate-200">{provisionedData.user.name}</strong> ({provisionedData.user.usn}) as <Badge variant="purple" size="sm">{provisionedData.user.role.toUpperCase()}</Badge>
                </div>
              </div>
            </Modal>
          )}
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
