"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";

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

  // Form modal state
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

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-gray-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-gray-400 hover:text-gray-300 text-sm">
                ← Admin Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Identity & Access Management</h1>
            <p className="text-gray-400 text-sm mt-1">
              Privileged role provisioning with Argon2id credentials and TOTP MFA binding.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-lg shadow-blue-600/20"
          >
            + Provision New User
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Users Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Registered Accounts ({users.length})</h2>
            <button
              onClick={loadUsers}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-800/60 text-xs uppercase text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-3.5">USN / Username</th>
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Device Keys</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Loading user accounts…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No accounts provisioned yet.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-800/40 transition">
                      <td className="px-6 py-4 font-mono font-medium text-white">{u.usn}</td>
                      <td className="px-6 py-4">{u.name}</td>
                      <td className="px-6 py-4 text-gray-400">{u.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.role === "admin" || u.role === "hod"
                              ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                              : u.role === "examiner"
                              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                              : "bg-green-500/20 text-green-400 border border-green-500/30"
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            title="Ed25519 Session Binding Key"
                            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                              u.hasEd25519Key
                                ? "bg-green-500/20 text-green-400"
                                : "bg-gray-800 text-gray-500"
                            }`}
                          >
                            Ed25519: {u.hasEd25519Key ? "✓" : "—"}
                          </span>
                          <span
                            title="ECDSA Submission Signature Key"
                            className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                              u.hasECDSAKey
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-gray-800 text-gray-500"
                            }`}
                          >
                            ECDSA: {u.hasECDSAKey ? "✓" : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {u.isLocked ? (
                          <span className="text-red-400 text-xs font-semibold">Locked</span>
                        ) : (
                          <span className="text-green-400 text-xs font-semibold">Active</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Provisioning Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white">Provision Account</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleProvision} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Target Role</label>
                <select
                  value={form.targetRole}
                  onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="examiner">Examiner (Question author & trustee)</option>
                  <option value="hod">HOD (Department trustee & auditor)</option>
                  <option value="admin">Administrator (Full security officer)</option>
                  <option value="student">Student (Candidate)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">USN / Username</label>
                <input
                  type="text"
                  placeholder="e.g. EXAM-FACULTY-01"
                  value={form.usn}
                  onChange={(e) => setForm({ ...form, usn: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Prof. John Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Official Email</label>
                <input
                  type="email"
                  placeholder="john.doe@kletech.ac.in"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Initial Password</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-semibold transition"
                >
                  {submitting ? "Provisioning…" : "Provision Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOTP Reveal Modal for Provisioned User */}
      {provisionedData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-green-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 text-green-400 mb-2">
              ✓
            </div>
            <h3 className="text-xl font-bold text-white">Account Provisioned!</h3>
            <p className="text-gray-400 text-xs">
              Provide this TOTP Authenticator QR code and secret to {provisionedData.user.name} ({provisionedData.user.usn}).
            </p>

            <div className="p-4 bg-white rounded-xl inline-block mx-auto shadow-inner">
              <img src={provisionedData.qrUrl} alt="TOTP QR Code" className="w-48 h-48 mx-auto" />
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-left">
              <p className="text-xs text-gray-400">TOTP Secret Key (Manual Entry):</p>
              <p className="font-mono text-sm text-yellow-400 font-bold tracking-wider mt-1 break-all select-all">
                {provisionedData.totpSecret}
              </p>
            </div>

            <button
              onClick={() => setProvisionedData(null)}
              className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-semibold transition"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
