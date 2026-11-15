import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full border-t border-slate-800/80 bg-slate-950/90 text-slate-400 text-xs mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Col 1: Institutional Header */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                K
              </div>
              <span className="font-semibold text-slate-200 text-sm">
                KLE Technological University
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-md">
              School of Computer Science & Engineering, Hubballi, Karnataka.
              Secure Online Examination System using Cryptography — Cryptographically verifiable, end-to-end zero-knowledge assessment platform.
            </p>
            <div className="pt-1 text-slate-400 text-[11px]">
              <span className="font-medium text-slate-300">Project Guide:</span> Miss Roopa Badami, Assistant Professor, Dept. of CSE
            </div>
          </div>

          {/* Col 2: Security Architecture */}
          <div className="space-y-2.5">
            <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider">
              Cryptography Core
            </h4>
            <ul className="space-y-1.5 text-slate-400 text-xs font-mono">
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>ECDH-P256 Ephemeral PFS</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span>AES-256-GCM Envelope</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>Shamir (2-of-3) Trustees</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>SHA-256 Merkle Proofs</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Zero-Width Steganography</span>
              </li>
            </ul>
          </div>

          {/* Col 3: System Links */}
          <div className="space-y-2.5">
            <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider">
              Verification & Tools
            </h4>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link href="/audit" className="hover:text-blue-400 transition-colors">
                  Immutable Audit Chain
                </Link>
              </li>
              <li>
                <Link href="/benchmarks" className="hover:text-blue-400 transition-colors">
                  Cryptographic Benchmarks
                </Link>
              </li>
              <li>
                <Link href="/results" className="hover:text-blue-400 transition-colors">
                  Merkle Result Verification
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-blue-400 transition-colors">
                  Institutional Auth Portal
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <div>
            &copy; {new Date().getFullYear()} KLE Technological University. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Audit Chain Synced</span>
            </span>
            <span>&bull;</span>
            <span>Zero-Trust Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
