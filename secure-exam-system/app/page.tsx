import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import ResponsiveHeroBanner from "@/components/ui/responsive-hero-banner";
import {
  ShieldCheck,
  KeyRound,
  Binary,
  GitCommitHorizontal,
  Lock,
  Layers,
  FileCheck2,
  Cpu,
  GraduationCap,
  Award,
} from "lucide-react";

export default function Home() {
  const securityPillars = [
    {
      title: "Threshold Key Ceremony",
      primitive: "Shamir (2-of-3) + Argon2id",
      description:
        "The Exam Master Key (ExamKEK) is split into 3 Shamir polynomial shares encrypted under independent trustee passphrases. Decryption requires a strict 2-of-3 quorum, preventing single-point insider leaks.",
      badge: "Zero-Knowledge",
      icon: <Lock className="w-5 h-5 text-indigo-400" aria-hidden="true" />,
    },
    {
      title: "Device-Bound Perfect Forward Secrecy",
      primitive: "ECDH-P256 + HKDF + AES-256-GCM",
      description:
        "Non-exportable WebCrypto ECDSA and Ed25519 keypairs bind student hardware. Ephemeral ECDH key exchange establishes dynamic AES-256-GCM session keys, protecting in-flight question papers and submissions.",
      badge: "PFS Enforced",
      icon: <KeyRound className="w-5 h-5 text-blue-400" aria-hidden="true" />,
    },
    {
      title: "Tamper-Evident Audit Chain",
      primitive: "SHA-256 Hash Chain + Ed25519 Signatures",
      description:
        "Every examination lifecycle transition is cryptographically bound into an immutable hash chain with previous-block digest linkage. Signed by an independent Ed25519 audit key for mathematical non-repudiation.",
      badge: "Cryptographic Log",
      icon: <GitCommitHorizontal className="w-5 h-5 text-emerald-400" aria-hidden="true" />,
    },
    {
      title: "Answer-Key Commit-Reveal Protocol",
      primitive: "SHA-256 + Salted Commitments",
      description:
        "Before the exam starts, examiners publish salted SHA-256 commitments of the answer key. The key cannot be altered retroactively during or after the examination, guaranteeing absolute grading fairness.",
      badge: "Anti-Tamper",
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" aria-hidden="true" />,
    },
    {
      title: "Verifiable Merkle Inclusion Proofs",
      primitive: "SHA-256 Merkle Tree Evaluation",
      description:
        "Exam submissions are hashed into a cryptographic Merkle tree. Every student receives an individual sibling proof string, allowing independent browser verification against the published root hash without disclosing peer submissions.",
      badge: "Public Verification",
      icon: <Binary className="w-5 h-5 text-purple-400" aria-hidden="true" />,
    },
    {
      title: "Forensic Steganographic Watermarking",
      primitive: "Zero-Width Unicode Characters (ZWSP/ZWNJ)",
      description:
        "Question prompts rendered on student devices contain invisible binary watermarks encoding candidate USN, exam ID, and timestamp. If screens are leaked or captured, forensic extraction identifies the source immediately.",
      badge: "Anti-Leak Forensics",
      icon: <Cpu className="w-5 h-5 text-cyan-400" aria-hidden="true" />,
    },
  ];

  const workflowSteps = [
    {
      step: "01",
      title: "Pre-Exam Quorum Setup",
      subtitle: "Shamir SSS & Commitments",
      desc: "Examiner splits ExamKEK into 3 trustee polynomial shares and publishes salted SHA-256 commitments of the answer key.",
    },
    {
      step: "02",
      title: "Ephemeral Session Handshake",
      subtitle: "ECDH-P256 & Hardware Binding",
      desc: "Student device generates client ECDH-P256 keys. Server verifies client challenge signature and derives unique AES-256-GCM session keys.",
    },
    {
      step: "03",
      title: "Encrypted Paper Delivery",
      subtitle: "ZWC Steganography & Autosave",
      desc: "Questions decrypted on student device with invisible forensic watermarks. Drafts encrypted continuously into IndexedDB.",
    },
    {
      step: "04",
      title: "Digitally Signed Submission",
      subtitle: "RFC 8785 Canonicalization",
      desc: "Answers are deterministically canonicalized, hashed with SHA-256, and signed by student's non-exportable ECDSA-P256 hardware key.",
    },
    {
      step: "05",
      title: "Post-Exam Verification",
      subtitle: "Merkle Trees & Audit Ledger",
      desc: "Submissions compiled into a Merkle batch. Candidates independently verify inclusion proofs against the immutable audit chain.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <main className="flex-1">
        {/* ── 21st.dev Responsive Hero Banner ─────────────────────────────── */}
        <ResponsiveHeroBanner />

        {/* ── Security Architecture Section (#security) ───────────────────── */}
        <section id="security" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 border-b border-slate-800/80">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="info" size="sm" dot>
              Cryptographic Architecture
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100 mt-3 font-serif">
              Built on Zero-Trust Cryptographic Rigor
            </h2>
            <p className="text-sm sm:text-base text-slate-400 mt-3 leading-relaxed">
              Every stage of the examination lifecycle is protected against insider threats, credential compromise,
              and retroactive result alteration through provable mathematical guarantees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityPillars.map((pillar) => (
              <Card key={pillar.title} hover className="flex flex-col justify-between border-slate-800/80 bg-slate-900/40">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
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
                    <div className="text-xs font-mono text-blue-400 mt-1">
                      {pillar.primitive}
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {pillar.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── How It Works (#how-it-works) ─────────────────────────────────── */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 border-b border-slate-800/80">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="purple" size="sm" dot>
              Examination Protocol Lifecycle
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100 mt-3 font-serif">
              How The Examination Protocol Operates
            </h2>
            <p className="text-sm sm:text-base text-slate-400 mt-3 leading-relaxed">
              From key generation ceremonies to independent candidate Merkle verification, each stage enforces formal cryptographic contracts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {workflowSteps.map((ws) => (
              <div
                key={ws.step}
                className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="text-2xl font-extrabold text-blue-500/80 font-mono">
                    {ws.step}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200 mt-2">
                    {ws.title}
                  </h3>
                  <div className="text-[11px] font-mono text-indigo-400 mt-0.5">
                    {ws.subtitle}
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {ws.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Institutional Role Portals (#platform) ───────────────────────── */}
        <section id="platform" className="border-b border-slate-800/80 bg-slate-900/30 py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-xl mx-auto mb-14">
              <Badge variant="info" size="sm">
                Role-Based Portals
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 mt-3 font-serif">
                Access System Portals
              </h2>
              <p className="text-sm text-slate-400 mt-2">
                Select your designated role to enter the secure environment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase text-blue-400 font-semibold tracking-wider">Student Portal</span>
                    <Badge variant="info" size="sm">Candidate</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100">Take Examination</h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                    Authenticate with USN, Argon2id credentials, and hardware WebCrypto keys. Access active assessments and verify Merkle inclusion proofs.
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="primary" size="md" className="w-full">
                    Student Login
                  </Button>
                </Link>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase text-purple-400 font-semibold tracking-wider">Examiner Portal</span>
                    <Badge variant="purple" size="sm">Faculty</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100">Manage Examinations</h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                    Create question banks with AES-256-GCM envelope encryption, conduct Shamir (2-of-3) key ceremonies, and publish commitments.
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="secondary" size="md" className="w-full">
                    Examiner Access
                  </Button>
                </Link>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase text-emerald-400 font-semibold tracking-wider">Audit Ledger</span>
                    <Badge variant="success" size="sm">Auditor</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100">Verify Audit Log</h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                    Browse the immutable SHA-256 hash chain, verify block signatures, and inspect real-time cryptographic benchmark metrics.
                  </p>
                </div>
                <Link href="/audit">
                  <Button variant="outline" size="md" className="w-full">
                    Open Audit Ledger
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── About & Institutional Governance (#about) ───────────────────── */}
        <section id="about" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950 border border-slate-800 text-center max-w-4xl mx-auto space-y-6 shadow-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-blue-300 text-xs font-mono">
              <GraduationCap className="w-4 h-4 text-blue-400" aria-hidden="true" />
              <span>KLE Technological University · Department of Computer Science &amp; Engineering</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-serif">
              Academic &amp; Institutional Governance
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl mx-auto">
              Developed as an advanced Cryptography &amp; Network Security (CNS) Capstone Project under the guidance of
              <strong className="text-white ml-1">Miss Roopa Badami</strong>. Engineered for zero-compromise institutional integrity,
              mathematical non-repudiation, and transparent academic evaluation.
            </p>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link href="/benchmarks">
                <Button variant="outline" size="sm">
                  View Cryptographic Benchmarks
                </Button>
              </Link>
              <Link href="/audit">
                <Button variant="ghost" size="sm">
                  Inspect Ed25519 Chain
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
