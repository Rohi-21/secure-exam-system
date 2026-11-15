import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

export default function Home() {
  const securityPillars = [
    {
      title: "Threshold Key Ceremony",
      primitive: "Shamir (2-of-3) + Argon2id",
      description:
        "The Exam Master Key (ExamKEK) is split into 3 Shamir polynomial shares encrypted under independent trustee passphrases. Decryption requires a strict 2-of-3 quorum, preventing single-point insider leaks.",
      badge: "Zero-Knowledge",
      icon: (
        <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
      ),
    },
    {
      title: "Device-Bound Perfect Forward Secrecy",
      primitive: "ECDH-P256 + HKDF + AES-256-GCM",
      description:
        "Non-exportable WebCrypto ECDSA and Ed25519 keypairs bind student hardware. Ephemeral ECDH key exchange establishes dynamic AES-256-GCM session keys, protecting in-flight question papers and submissions.",
      badge: "PFS Enforced",
      icon: (
        <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
    },
    {
      title: "Tamper-Evident Audit Chain",
      primitive: "SHA-256 Hash Chain + Ed25519 Signatures",
      description:
        "Every examination lifecycle transition is cryptographically bound into an immutable hash chain with previous-block digest linkage. Signed by an independent Ed25519 audit key for mathematical non-repudiation.",
      badge: "Cryptographic Log",
      icon: (
        <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      ),
    },
    {
      title: "Answer-Key Commit-Reveal Protocol",
      primitive: "SHA-256 + Salted Commitments",
      description:
        "Before the exam starts, examiners publish salted SHA-256 commitments of the answer key. The key cannot be altered retroactively during or after the examination, guaranteeing absolute grading fairness.",
      badge: "Anti-Tamper",
      icon: (
        <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      ),
    },
    {
      title: "Verifiable Merkle Inclusion Proofs",
      primitive: "SHA-256 Merkle Tree Evaluation",
      description:
        "Exam submissions are hashed into a cryptographic Merkle tree. Every student receives an individual sibling proof string, allowing independent browser verification against the published root hash without disclosing peer submissions.",
      badge: "Public Verification",
      icon: (
        <svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
    {
      title: "Forensic Steganographic Watermarking",
      primitive: "Zero-Width Unicode Characters (ZWSP/ZWNJ)",
      description:
        "Question prompts rendered on student devices contain invisible binary watermarks encoding candidate USN, exam ID, and timestamp. If screens are leaked or captured, forensic extraction identifies the source immediately.",
      badge: "Anti-Leak Forensics",
      icon: (
        <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-b from-slate-900/60 via-slate-950 to-slate-950 py-20 sm:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/70 border border-blue-800/60 text-blue-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>KLE Technological University · Department of CSE</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100 max-w-4xl mx-auto leading-tight">
              Cryptographically Secure Online Examination System
            </h1>

            <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-400 leading-relaxed">
              An institutional zero-trust assessment platform featuring client-side WebCrypto hardware binding,
              Shamir (2-of-3) threshold key ceremonies, ephemeral ECDH session secrecy, and a tamper-evident SHA-256 audit ledger.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
              <Link href="/login">
                <Button size="lg" variant="primary">
                  Access Portal
                </Button>
              </Link>
              <Link href="/register">
                <Button size="lg" variant="secondary">
                  Register Device Keys
                </Button>
              </Link>
              <Link href="/audit">
                <Button size="lg" variant="outline">
                  Inspect Audit Chain
                </Button>
              </Link>
            </div>

            {/* Live Metrics Row */}
            <div className="pt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-left">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">Key Exchange</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">ECDH-P256</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Forward Secrecy
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">Key Custody</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">Shamir 2-of-3</div>
                <div className="text-[11px] text-blue-400 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Quorum Enforced
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">Integrity Ledger</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">SHA-256 Chain</div>
                <div className="text-[11px] text-indigo-400 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Ed25519 Signed
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
                <div className="text-xs font-mono text-slate-400 uppercase">Verification</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">Merkle Trees</div>
                <div className="text-[11px] text-purple-400 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  Public Auditability
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Security Architecture Grid */}
        <section id="architecture" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="info" size="sm" dot>
              Cryptographic Architecture
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 mt-3">
              Built on Zero-Trust Cryptographic Rigor
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
              Every stage of the examination lifecycle is protected against insider threats, credential compromise,
              and retroactive result alteration through provable mathematical guarantees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityPillars.map((pillar) => (
              <Card key={pillar.title} hover className="flex flex-col justify-between">
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
                      {pillar.icon}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                      {pillar.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-100">
                      {pillar.title}
                    </h3>
                    <div className="text-xs font-mono text-blue-400 mt-0.5">
                      {pillar.primitive}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {pillar.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Role Portal Cards */}
        <section className="border-t border-slate-800/80 bg-slate-900/30 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-xl mx-auto mb-10">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                Institutional Portals
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Select your designated role to enter the secure environment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase text-blue-400 font-semibold">Student Portal</span>
                    <Badge variant="info" size="sm">Candidate</Badge>
                  </div>
                  <h3 className="text-base font-semibold text-slate-100">Take Examination</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Authenticate with USN, Argon2id credentials, and hardware WebCrypto keys. Access active assessments and verify Merkle inclusion proofs.
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="primary" size="sm" className="w-full">
                    Student Login
                  </Button>
                </Link>
              </div>

              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase text-purple-400 font-semibold">Examiner Portal</span>
                    <Badge variant="purple" size="sm">Faculty</Badge>
                  </div>
                  <h3 className="text-base font-semibold text-slate-100">Manage Examinations</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Create question banks with AES-256-GCM envelope encryption, conduct Shamir (2-of-3) key ceremonies, and publish commitments.
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="secondary" size="sm" className="w-full">
                    Examiner Access
                  </Button>
                </Link>
              </div>

              <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase text-emerald-400 font-semibold">Audit Ledger</span>
                    <Badge variant="success" size="sm">Auditor</Badge>
                  </div>
                  <h3 className="text-base font-semibold text-slate-100">Verify Audit Log</h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Browse the immutable SHA-256 hash chain, verify block signatures, and inspect real-time cryptographic benchmark metrics.
                  </p>
                </div>
                <Link href="/audit">
                  <Button variant="outline" size="sm" className="w-full">
                    Open Audit Ledger
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
