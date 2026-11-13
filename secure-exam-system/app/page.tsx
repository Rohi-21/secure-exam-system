import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Navigation Header */}
      <header className="border-b border-gray-800/80 bg-gray-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-mono font-bold text-lg">
              🛡️
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white block">CNS Exam System</span>
              <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider block">KLE Technological University</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-md shadow-blue-600/25"
            >
              Candidate Registration
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 sm:py-24 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          CNS Academic Project · Research-Grade Cryptographic Architecture
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Secure Online Examination System <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
            Using Modern Cryptography
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-gray-400 text-base sm:text-lg leading-relaxed">
          An end-to-end verifiable examination platform featuring application-layer ECDH-P256 session encryption,
          Shamir (2-of-3) Secret Sharing threshold key ceremonies, cryptographic answer-key commitments,
          and a tamper-evident SHA-256 hash-chain audit log.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link
            href="/login"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-base font-semibold transition shadow-xl shadow-blue-600/25"
          >
            Access Examination Portal
          </Link>
          <Link
            href="/register"
            className="px-6 py-3 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-white rounded-xl text-base font-semibold transition"
          >
            Register Student Device Keys
          </Link>
        </div>

        {/* Cryptographic Primitives Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 text-left">
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold mb-4">
              🔑
            </div>
            <h3 className="text-base font-bold text-white mb-2">Threshold Key Ceremony</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Exam Master Key (ExamKEK) split into 3 Shamir shares encrypted under Argon2id trustee passwords.
              Reconstruction requires a strict 2-of-3 quorum.
            </p>
          </div>

          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold mb-4">
              🔒
            </div>
            <h3 className="text-base font-bold text-white mb-2">ECDH + Session Encryption</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Browser generates non-exportable WebCrypto ECDSA and Ed25519 device keys.
              Question papers and submissions are protected by HKDF-derived AES-256-GCM session keys.
            </p>
          </div>

          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold mb-4">
              📜
            </div>
            <h3 className="text-base font-bold text-white mb-2">Tamper-Evident Audit Chain</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Every critical lifecycle event is signed with an independent Ed25519 audit key and chained
              via SHA-256 digests, providing non-repudiation and detection of server-side alteration.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-900 bg-gray-950 py-8 text-center text-xs text-gray-500 space-y-2">
        <p>
          KLE Technological University, Hubballi · Cryptography & Network Security (CNS) Capstone Project
        </p>
        <p>
          Guide: <span className="text-gray-400 font-medium">Miss Roopa Badami</span> · Department of Computer Science & Engineering
        </p>
      </footer>
    </div>
  );
}
