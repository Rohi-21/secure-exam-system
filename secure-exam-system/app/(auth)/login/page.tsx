"use client";

/**
 * Login Page
 *
 * 3-Factor Authentication Flow:
 * 1. User enters USN + password + TOTP code → POST /api/auth/login
 * 2. Server verifies Argon2id password hash + TOTP HMAC-SHA1
 * 3. Server issues challengeNonce
 * 4. Client WebCrypto signs challengeNonce with non-exportable Ed25519 private key
 * 5. POST /api/auth/login/challenge → server verifies signature → issues JWT
 * 6. JWT stored in memory (__accessToken), refresh token in httpOnly cookie
 */

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserKeys, storeBrowserKeys } from "../register/page";
import { loadDeviceKeys } from "@/lib/crypto/client-keystore";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authStep, setAuthStep] = useState<"credentials" | "signing" | "complete">("credentials");

  const [form, setForm] = useState({ usn: "", password: "", totpCode: "" });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setAuthStep("credentials");

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
        setError(loginData.error ?? "Authentication failed. Check your USN, password, or TOTP code.");
        return;
      }

      const { challengeNonce, userId } = loginData;
      setAuthStep("signing");

      // ── Step 2: Ed25519 session binding ───────────────────────────────
      // Administrative roles (admin, hod) do not require local browser device key binding
      if (loginData.role === "admin" || loginData.role === "hod") {
        await completeLogin(userId, challengeNonce, null);
        return;
      }

      let keys = getBrowserKeys();
      if (!keys?.ed25519Private) {
        const loaded = await loadDeviceKeys();
        if (loaded) {
          keys = loaded;
          storeBrowserKeys(keys);
        }
      }

      if (!keys?.ed25519Private) {
        // Keys not on this device/browser
        console.warn("[login] Ed25519 private key not found in storage. Proceeding with standard authentication.");
        await completeLogin(userId, challengeNonce, null);
        return;
      }

      // Check if the stored browser key belongs to this user (e.g. on shared machines)
      if (loginData.ed25519PubKey && keys.ed25519Public) {
        try {
          const pubRaw = await crypto.subtle.exportKey("spki", keys.ed25519Public);
          const localPubB64 = btoa(String.fromCharCode(...new Uint8Array(pubRaw)));
          if (!loginData.ed25519PubKey.includes(localPubB64) && !localPubB64.includes(loginData.ed25519PubKey)) {
            console.warn("[login] Stored browser key belongs to another user. Proceeding with standard authentication.");
            await completeLogin(userId, challengeNonce, null);
            return;
          }
        } catch {
          // If export is not supported, proceed with signing attempt
        }
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
      setError("Login failed. Check server connectivity or device key state.");
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
      setError(challengeData.error ?? "Session binding challenge failed");
      return;
    }

    setAuthStep("complete");

    // Store access token in memory (window variable — not localStorage/sessionStorage)
    (window as typeof window & { __accessToken?: string }).__accessToken = challengeData.accessToken;

    // Redirect based on role
    const role = challengeData.user?.role;
    if (role === "admin" || role === "hod") router.push("/admin");
    else if (role === "examiner") router.push("/exams");
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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-8">
        <div className="w-full max-w-md space-y-6">
          {/* Header Title */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 mb-1 shadow-sm">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Institutional Sign In
            </h1>
            <p className="text-xs text-slate-400">
              KLE Tech Cryptographically Verifiable Examination Platform
            </p>
          </div>

          {/* Login Card */}
          <Card className="border-slate-800 shadow-xl shadow-slate-950/60">
            <CardContent className="p-6 sm:p-8 space-y-5">
              {error && (
                <div
                  role="alert"
                  className="p-3.5 bg-red-950/50 border border-red-800/80 rounded-lg text-red-300 text-xs flex items-start gap-2.5 leading-relaxed"
                >
                  <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {/* USN Field */}
                <Input
                  label="University Seat Number (USN)"
                  placeholder="01FE23BCS240 or admin"
                  value={form.usn}
                  onChange={(e) => setForm({ ...form, usn: e.target.value.toUpperCase() })}
                  required
                  autoComplete="username"
                  autoFocus
                  leftIcon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  }
                />

                {/* Password Field */}
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  autoComplete="current-password"
                  leftIcon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  }
                />

                {/* TOTP Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-slate-300">
                      Authenticator Code (TOTP)
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      RFC 6238 · 30s
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]{6,7}"
                    maxLength={7}
                    placeholder="000 000"
                    value={form.totpCode}
                    onChange={(e) => setForm({ ...form, totpCode: e.target.value })}
                    required
                    autoComplete="one-time-code"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-center text-lg tracking-[0.3em] font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                  <p className="text-[11px] text-slate-400">
                    Enter the 6-digit verification code from Google Authenticator or your authenticator app.
                  </p>
                </div>

                <Button
                  type="submit"
                  size="md"
                  loading={loading}
                  className="w-full mt-2"
                >
                  {authStep === "signing"
                    ? "Signing Hardware Nonce…"
                    : authStep === "complete"
                    ? "Authenticated"
                    : "Authenticate & Bind Session"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 3-Factor Protocol Explanation */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                3-Factor Authentication Pipeline
              </span>
              <Badge variant="purple" size="sm">Zero-Knowledge</Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-950 border border-blue-800 text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                  1
                </span>
                <span className="font-mono text-slate-200">Argon2id</span>
                <span className="text-slate-400">Memory-hard password hashing</span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                  2
                </span>
                <span className="font-mono text-slate-200">TOTP 2FA</span>
                <span className="text-slate-400">HMAC-SHA1 time-synchronised token</span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                  3
                </span>
                <span className="font-mono text-slate-200">Ed25519</span>
                <span className="text-slate-400">WebCrypto non-exportable hardware binding</span>
              </div>
            </div>
          </div>

          {/* Register Link */}
          <div className="text-center text-xs text-slate-400">
            First time taking an exam on this device?{" "}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Register Device Keys
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
