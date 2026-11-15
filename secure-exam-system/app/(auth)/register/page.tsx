"use client";

/**
 * Registration Page
 *
 * Key Cryptographic Decisions:
 * 1. Ed25519 and ECDSA-P256 key pairs are generated in the browser via WebCrypto.
 *    Private keys NEVER leave this machine — stored as non-exportable CryptoKeys in IndexedDB.
 * 2. Only PUBLIC keys (SPKI base64 format) are transmitted to the server.
 * 3. TOTP RFC 6238 QR code rendered after server registration.
 * 4. User verifies with an initial 6-digit code to finalize enrollment.
 */

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { saveDeviceKeys } from "@/lib/crypto/client-keystore";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type Step = "form" | "qr" | "done";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [form, setForm] = useState({
    usn: "",
    email: "",
    name: "",
    password: "",
    confirmPassword: "",
    role: "student",
  });

  // Post-registration state
  const [userId, setUserId] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");

  // ── Step 1: Generate browser keys + register ──────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      // ── WebCrypto: Generate Ed25519 key pair ─────────────────────────
      let ed25519KeyPair: CryptoKeyPair;
      try {
        ed25519KeyPair = await crypto.subtle.generateKey(
          { name: "Ed25519" },
          false, // non-exportable private key
          ["sign", "verify"]
        );
      } catch {
        setError(
          "Your browser does not support Ed25519 WebCrypto. Please use Chrome 113+, Firefox 128+, or Safari 17+."
        );
        setLoading(false);
        return;
      }

      // ── WebCrypto: Generate ECDSA-P256 key pair ───────────────────────
      const ecdsaKeyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false, // non-exportable private key
        ["sign", "verify"]
      );

      // ── Export only PUBLIC keys (SPKI format → base64) ───────────────
      const ed25519PubRaw = await crypto.subtle.exportKey("spki", ed25519KeyPair.publicKey);
      const ecdsaPubRaw = await crypto.subtle.exportKey("spki", ecdsaKeyPair.publicKey);
      const ed25519PubKey = btoa(String.fromCharCode(...new Uint8Array(ed25519PubRaw)));
      const ecdsaPubKey = btoa(String.fromCharCode(...new Uint8Array(ecdsaPubRaw)));

      // Persist private keys in browser IndexedDB
      await saveDeviceKeys({
        ed25519Private: ed25519KeyPair.privateKey,
        ed25519Public: ed25519KeyPair.publicKey,
        ecdsaPrivate: ecdsaKeyPair.privateKey,
        ecdsaPublic: ecdsaKeyPair.publicKey,
      });

      // Also set in memory for current page session
      storeBrowserKeys({
        ed25519Private: ed25519KeyPair.privateKey,
        ecdsaPrivate: ecdsaKeyPair.privateKey,
        ecdsaPublic: ecdsaKeyPair.publicKey,
        ed25519Public: ed25519KeyPair.publicKey,
      });

      // ── Send to server (Public registration is strictly student role) ─
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usn: form.usn,
          email: form.email,
          name: form.name,
          password: form.password,
          ed25519PubKey,
          ecdsaPubKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration request rejected by server.");
        return;
      }

      // ── Render TOTP QR code ──────────────────────────────────────────
      const dataUrl = await QRCode.toDataURL(data.totpUri, { width: 220, margin: 2 });
      setQrDataUrl(dataUrl);
      setUserId(data.userId);
      setStep("qr");
    } catch (err) {
      setError("Registration process encountered an unexpected error.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Confirm TOTP ──────────────────────────────────────────────
  async function handleVerifyTOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed. Check the 6-digit TOTP code.");
        return;
      }
      setStep("done");
    } catch {
      setError("Verification service unreachable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-8">
        <div className="w-full max-w-lg space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 mb-1 shadow-sm">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Candidate Registration
            </h1>
            <p className="text-xs text-slate-400">
              Enroll your identity and generate hardware-bound WebCrypto cryptographic credentials.
            </p>
          </div>

          {/* Stepper Progress Indicator */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "form", num: "1", title: "Identity & Keys" },
              { id: "qr", num: "2", title: "TOTP 2FA" },
              { id: "done", num: "3", title: "Complete" },
            ].map((s) => {
              const isCurrent = step === s.id;
              const isPassed =
                (s.id === "form" && (step === "qr" || step === "done")) ||
                (s.id === "qr" && step === "done");
              return (
                <div
                  key={s.id}
                  className={`p-2.5 rounded-lg border text-center transition-colors ${
                    isCurrent
                      ? "bg-blue-950/60 border-blue-500/60 text-blue-300"
                      : isPassed
                      ? "bg-slate-900 border-emerald-500/40 text-emerald-400"
                      : "bg-slate-900/30 border-slate-800 text-slate-500"
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase tracking-wider">
                    Step {s.num}
                  </div>
                  <div className="text-xs font-semibold mt-0.5 truncate">{s.title}</div>
                </div>
              );
            })}
          </div>

          {/* Registration Card */}
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

              {/* Step 1: Form */}
              {step === "form" && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="University Seat Number (USN)"
                      placeholder="01FE23BCS240"
                      value={form.usn}
                      onChange={(e) => setForm({ ...form, usn: e.target.value.toUpperCase() })}
                      required
                    />

                    <Input
                      label="Full Name"
                      placeholder="Rohidas Shenoy"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>

                  <Input
                    label="University Email"
                    type="email"
                    placeholder="candidate@kletech.ac.in"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Password"
                      type="password"
                      placeholder="••••••••••••"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      helperText="Min. 12 characters"
                      required
                    />

                    <Input
                      label="Confirm Password"
                      type="password"
                      placeholder="••••••••••••"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      required
                    />
                  </div>

                  {/* Hardware binding note */}
                  <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl text-xs text-blue-300 flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <p className="leading-relaxed">
                      <strong>WebCrypto Device Secrecy:</strong> Ed25519 and ECDSA-P256 private keys are generated inside your browser and stored as non-exportable hardware secrets in IndexedDB. Private keys never leave your machine.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    size="md"
                    loading={loading}
                    className="w-full mt-2"
                  >
                    Generate Device Keys & Register
                  </Button>

                  <p className="text-center text-xs text-slate-400 pt-2">
                    Already registered?{" "}
                    <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                      Sign in
                    </Link>
                  </p>
                </form>
              )}

              {/* Step 2: QR Code */}
              {step === "qr" && (
                <div className="space-y-5 text-center">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Scan with Authenticator App
                    </h3>
                    <p className="text-xs text-slate-400">
                      Open Google Authenticator, Authy, or Microsoft Authenticator on your mobile device to scan this code.
                    </p>
                  </div>

                  {qrDataUrl && (
                    <div className="inline-block p-4 bg-white rounded-2xl shadow-xl shadow-slate-950/80">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrDataUrl}
                        alt="TOTP QR Code"
                        width={220}
                        height={220}
                        className="rounded-lg"
                      />
                    </div>
                  )}

                  <form onSubmit={handleVerifyTOTP} className="space-y-4 max-w-xs mx-auto">
                    <div className="space-y-1.5 text-left">
                      <label className="text-xs font-medium text-slate-300">
                        Confirm 6-Digit TOTP Code
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="000000"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-center text-xl tracking-[0.4em] font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <Button
                      type="submit"
                      size="md"
                      loading={loading}
                      disabled={totpCode.length !== 6}
                      className="w-full"
                    >
                      Confirm & Finalize Enrollment
                    </Button>
                  </form>
                </div>
              )}

              {/* Step 3: Done */}
              {step === "done" && (
                <div className="text-center py-4 space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-emerald-400 shadow-md">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">
                      Enrollment Completed Successfully
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                      Your identity and device keys are bound. You are ready to log into the examination environment.
                    </p>
                  </div>

                  <Button
                    onClick={() => router.push("/login")}
                    className="w-full max-w-xs mx-auto"
                  >
                    Proceed to Sign In
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ── Browser key store (module-level, survives re-renders) ──────────────────
interface BrowserKeys {
  ed25519Private: CryptoKey;
  ed25519Public: CryptoKey;
  ecdsaPrivate: CryptoKey;
  ecdsaPublic: CryptoKey;
}
let _browserKeys: BrowserKeys | null = null;
export function storeBrowserKeys(keys: BrowserKeys) {
  _browserKeys = keys;
}
export function getBrowserKeys(): BrowserKeys | null {
  return _browserKeys;
}
