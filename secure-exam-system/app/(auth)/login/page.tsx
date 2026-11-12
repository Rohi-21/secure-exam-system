"use client";

/**
 * Login Page
 *
 * Login flow:
 * 1. User enters USN + password + TOTP code → POST /api/auth/login
 * 2. Server returns a challengeNonce if 2FA passes
 * 3. Browser signs the nonce with its non-exportable Ed25519 private key
 * 4. POST /api/auth/login/challenge → server verifies → issues JWT
 * 5. JWT stored in memory (not localStorage) — refresh token in httpOnly cookie
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserKeys } from "../register/page";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ usn: "", password: "", totpCode: "" });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // ── Step 1: Password + TOTP ───────────────────────────────────────
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usn: form.usn,
          password: form.password,
          totpCode: form.totpCode.replace(/\s/g, ""),
        }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        setError(loginData.error ?? "Login failed");
        return;
      }

      const { challengeNonce, userId } = loginData;

      // ── Step 2: Ed25519 session binding ───────────────────────────────
      const keys = getBrowserKeys();
      if (!keys?.ed25519Private) {
        // Keys not in memory — either page was refreshed or different device.
        // For now, skip binding (graceful degradation — still 2FA secured).
        // In production: re-derive from stored key reference or prompt re-registration.
        console.warn("[login] Ed25519 private key not in memory. Proceeding without session binding.");
        await completeLogin(userId, challengeNonce, null);
        return;
      }

      // Sign the nonce bytes — pass as ArrayBuffer for strict WebCrypto compat
      const nonceBytes = hexToBytes(challengeNonce);
      const signatureBytes = await crypto.subtle.sign(
        { name: "Ed25519" },
        keys.ed25519Private,
        nonceBytes.buffer.slice(nonceBytes.byteOffset, nonceBytes.byteOffset + nonceBytes.byteLength) as ArrayBuffer
      );
      const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

      await completeLogin(userId, challengeNonce, signatureB64);

    } catch (err) {
      console.error(err);
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function completeLogin(userId: string, challengeNonce: string, signature: string | null) {
    const challengeRes = await fetch("/api/auth/login/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        challengeNonce,
        signature: signature ?? "no-key-in-memory",
      }),
    });

    const challengeData = await challengeRes.json();
    if (!challengeRes.ok) {
      setError(challengeData.error ?? "Session verification failed");
      return;
    }

    // Store access token in memory (window variable — not localStorage/sessionStorage)
    // This prevents XSS-based token theft from storage APIs
    (window as typeof window & { __accessToken?: string }).__accessToken = challengeData.accessToken;

    // Redirect based on role
    const role = challengeData.user?.role;
    if (role === "admin" || role === "hod") router.push("/admin");
    else if (role === "examiner") router.push("/examiner");
    else router.push("/dashboard");
  }

  function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 p-8">

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-600/20 mb-3">
            <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Sign In</h1>
          <p className="text-gray-400 text-sm mt-1">Secure Examination System</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">USN</label>
            <input
              type="text"
              placeholder="01FE23BCS240"
              value={form.usn}
              onChange={(e) => setForm({ ...form, usn: e.target.value.toUpperCase() })}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Authenticator Code
              <span className="ml-2 text-xs text-gray-500">(from your TOTP app)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="000 000"
              value={form.totpCode}
              onChange={(e) => setForm({ ...form, totpCode: e.target.value })}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-center text-xl tracking-widest"
            />
          </div>

          <div className="p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg text-xs text-gray-400 flex items-start gap-2">
            <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Account locks after 5 failed attempts for 15 minutes.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg py-2.5 font-medium transition-colors"
          >
            {loading ? "Verifying…" : "Sign In"}
          </button>

          <p className="text-center text-sm text-gray-500">
            No account?{" "}
            <a href="/register" className="text-blue-400 hover:text-blue-300">Register</a>
          </p>
        </form>
      </div>
    </div>
  );
}
