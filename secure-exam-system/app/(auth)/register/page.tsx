"use client";

/**
 * Registration Page
 *
 * Key design decisions:
 * 1. Ed25519 and ECDSA-P256 key pairs are generated HERE in the browser via WebCrypto.
 *    Private keys NEVER leave this page — they are stored as non-exportable CryptoKeys.
 * 2. Only PUBLIC keys are sent to the server.
 * 3. TOTP QR code is rendered after successful server registration.
 * 4. User confirms TOTP with one code to complete registration.
 *
 * Browser requirement: Chrome 113+, Firefox 128+, Safari 17+ (for Ed25519 WebCrypto)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { saveDeviceKeys } from "@/lib/crypto/client-keystore";

type Step = "form" | "qr" | "done";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [form, setForm] = useState({
    usn: "", email: "", name: "", password: "", confirmPassword: "", role: "student",
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
        // Fallback message for older browsers
        setError("Your browser does not support Ed25519 WebCrypto. Please use Chrome 113+, Firefox 128+, or Safari 17+.");
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

      // Persist private keys in browser IndexedDB (survives reloads and page navigations)
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
      if (!res.ok) { setError(data.error); return; }

      // ── Render TOTP QR code ──────────────────────────────────────────
      const dataUrl = await QRCode.toDataURL(data.totpUri, { width: 220, margin: 2 });
      setQrDataUrl(dataUrl);
      setUserId(data.userId);
      setStep("qr");

    } catch (err) {
      setError("Registration failed. Check console for details.");
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
      if (!res.ok) { setError(data.error); return; }
      setStep("done");
    } catch {
      setError("Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 p-8">

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-600/20 mb-3">
            <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Secure Exam System</h1>
          <p className="text-gray-400 text-sm mt-1">
            {step === "form" && "Create your account"}
            {step === "qr" && "Set up two-factor authentication"}
            {step === "done" && "Registration complete"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Registration form */}
        {step === "form" && (
          <form onSubmit={handleRegister} className="space-y-4">
            {[
              { label: "USN", key: "usn", type: "text", placeholder: "01FE23BCS240" },
              { label: "Full Name", key: "name", type: "text", placeholder: "K Rohidas Shenoy" },
              { label: "Email", key: "email", type: "email", placeholder: "you@kletech.ac.in" },
              { label: "Password (min 12 chars)", key: "password", type: "password", placeholder: "••••••••••••" },
              { label: "Confirm Password", key: "confirmPassword", type: "password", placeholder: "••••••••••••" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1">{label}</label>
                <input
                  type={type}
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
            ))}

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
              🔑 Cryptographic device keys are generated and stored securely in this browser. Your private key never leaves this device.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg py-2.5 font-medium transition-colors"
            >
              {loading ? "Generating keys & registering…" : "Register"}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{" "}
              <a href="/login" className="text-blue-400 hover:text-blue-300">Sign in</a>
            </p>
          </form>
        )}

        {/* Step 2: TOTP QR code */}
        {step === "qr" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-gray-300 text-sm mb-4">
                Scan this QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app on your <strong>mobile device</strong>.
              </p>
              {qrDataUrl && (
                <div className="inline-block p-3 bg-white rounded-xl">
                  <img src={qrDataUrl} alt="TOTP QR Code" width={220} height={220} />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-3">
                Use a <em>different device</em> from this browser for stronger security.
              </p>
            </div>

            <form onSubmit={handleVerifyTOTP} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Enter 6-digit code from your app</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-center text-2xl tracking-widest"
                />
              </div>
              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white rounded-lg py-2.5 font-medium transition-colors"
              >
                {loading ? "Verifying…" : "Confirm & Complete Registration"}
              </button>
            </form>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium">Registration complete!</p>
            <p className="text-gray-400 text-sm">Your account is ready. You can now sign in.</p>
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 font-medium transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
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
export function storeBrowserKeys(keys: BrowserKeys) { _browserKeys = keys; }
export function getBrowserKeys(): BrowserKeys | null { return _browserKeys; }
