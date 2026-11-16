import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent } from "@/components/ui/Card";
import ResponsiveHeroBanner from "@/components/ui/responsive-hero-banner";
import {
  ShieldCheck,
  KeyRound,
  Binary,
  GitCommitHorizontal,
  Lock,
  Cpu,
  GraduationCap,
  ArrowRight,
} from "lucide-react";

export default function Home() {
  const systemCapabilities = [
    {
      label: "Encrypted Examination Data",
      sublabel: "AES-256-GCM AEAD payload secrecy",
      primitive: "AES-GCM",
      icon: ShieldCheck,
    },
    {
      label: "Answer Integrity",
      sublabel: "Non-exportable ECDSA-P256 device signatures",
      primitive: "ECDSA-P256",
      icon: KeyRound,
    },
    {
      label: "Cryptographic Verification",
      sublabel: "Independent SHA-256 Merkle inclusion proofs",
      primitive: "Merkle Tree",
      icon: Binary,
    },
    {
      label: "Tamper-Evident History",
      sublabel: "Signed sequential SHA-256 audit ledger",
      primitive: "Audit Chain",
      icon: GitCommitHorizontal,
    },
    {
      label: "Controlled Key Management",
      sublabel: "Decentralized Shamir 2-of-3 threshold quorum",
      primitive: "Shamir SSS",
      icon: Lock,
    },
  ];
  const securityPillars = [
    {
      title: "Threshold Key Ceremony",
      primitive: "Shamir (2-of-3) + Argon2id",
      description:
        "The Exam Master Key (ExamKEK) is split into 3 Shamir polynomial shares encrypted under independent trustee passphrases. Decryption requires a strict 2-of-3 quorum, preventing single-point insider leaks.",
      badge: "Threshold Quorum",
      icon: <Lock className="w-5 h-5 text-[#A78BFA]" aria-hidden="true" />,
    },
    {
      title: "Device-Bound Forward Secrecy",
      primitive: "ECDH-P256 + HKDF + AES-256-GCM",
      description:
        "Hardware-bound WebCrypto ECDSA keypairs identify student devices. Ephemeral ECDH key exchange establishes dynamic AES-256-GCM session keys, protecting in-flight question papers and submissions.",
      badge: "PFS Enforced",
      icon: <KeyRound className="w-5 h-5 text-[#8B5CF6]" aria-hidden="true" />,
    },
    {
      title: "Tamper-Evident Audit Chain",
      primitive: "SHA-256 Hash Chain + Ed25519 Signatures",
      description:
        "Every examination lifecycle transition is cryptographically bound into an immutable hash chain with previous-block digest linkage, signed by an independent Ed25519 audit key for mathematical non-repudiation.",
      badge: "Cryptographic Log",
      icon: <GitCommitHorizontal className="w-5 h-5 text-[#E8DCC4]" aria-hidden="true" />,
    },
    {
      title: "Answer-Key Commit-Reveal Protocol",
      primitive: "SHA-256 + Salted Commitments",
      description:
        "Before the exam starts, examiners publish salted SHA-256 commitments of the answer key. The key cannot be altered retroactively during or after the examination, guaranteeing absolute grading fairness.",
      badge: "Anti-Tamper",
      icon: <ShieldCheck className="w-5 h-5 text-[#A78BFA]" aria-hidden="true" />,
    },
    {
      title: "Verifiable Merkle Inclusion Proofs",
      primitive: "SHA-256 Merkle Tree Evaluation",
      description:
        "Exam submissions are hashed into a cryptographic Merkle tree. Every student receives an individual sibling proof string, allowing independent browser verification against the published root hash without disclosing peer submissions.",
      badge: "Public Verification",
      icon: <Binary className="w-5 h-5 text-[#8B5CF6]" aria-hidden="true" />,
    },
    {
      title: "Forensic Steganographic Watermarking",
      primitive: "Zero-Width Unicode Characters (ZWSP/ZWNJ)",
      description:
        "Question prompts rendered on student devices contain invisible binary watermarks encoding candidate USN, exam ID, and timestamp. If screens are leaked or captured, forensic extraction identifies the source immediately.",
      badge: "Forensic Trace",
      icon: <Cpu className="w-5 h-5 text-[#E8DCC4]" aria-hidden="true" />,
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
    <div className="min-h-screen flex flex-col bg-[#0C1811] text-[#E8DCC4]">
      <main className="flex-1">
        {/* ── 21st.dev Responsive Hero Banner (Minimal, Spacious, Brand Palette) ── */}
        <ResponsiveHeroBanner />

        {/* ── Separate Supporting Capabilities Strip (Moved below Hero Fold) ── */}
        <section
          id="guarantees"
          className="border-t border-b border-[#2A4F39] bg-[#0F2016] py-12 sm:py-16"
          aria-label="Core Cryptographic Guarantees"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-wider text-[#C9BC9F] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse" aria-hidden="true" />
              <span>Core Cryptographic Security Guarantees</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 text-left">
              {systemCapabilities.map((cap, index) => {
                const Icon = cap.icon;
                return (
                  <div
                    key={index}
                    className="group p-4 rounded-xl bg-[#14251B]/80 border border-[#2A4F39] hover:border-[#8B5CF6]/50 hover:bg-[#1A3023] hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between shadow-lg shadow-black/20"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#1F3D2B] border border-[#8B5CF6]/30 flex items-center justify-center text-[#A78BFA] group-hover:border-[#8B5CF6]/60 transition-colors">
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <span className="text-[10px] font-mono text-[#A78BFA] px-2 py-0.5 rounded bg-[#1F3D2B] border border-[#8B5CF6]/30">
                        {cap.primitive}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-[#F5EFE4] group-hover:text-white transition-colors">
                        {cap.label}
                      </h3>
                      <p className="text-[11px] text-[#C9BC9F] mt-1 leading-snug">
                        {cap.sublabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Security Architecture Section (#security) ───────────────────── */}
        <section id="security" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 border-b border-[#2A4F39]">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14251B] border border-[#8B5CF6]/30 text-[#A78BFA] text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
              <span>Cryptographic Architecture</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F5EFE4] mt-3 font-serif">
              Built on Zero-Trust Cryptographic Rigor
            </h2>
            <p className="text-sm sm:text-base text-[#C9BC9F] mt-3 leading-relaxed">
              Every stage of the examination lifecycle is protected against insider threats, credential compromise,
              and retroactive result alteration through provable mathematical guarantees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityPillars.map((pillar) => (
              <Card key={pillar.title} hover className="flex flex-col justify-between border-[#2A4F39] bg-[#14251B]/70">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#1F3D2B] border border-[#8B5CF6]/30 flex items-center justify-center">
                      {pillar.icon}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1F3D2B] text-[#E8DCC4] border border-[#2A4F39]">
                      {pillar.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-[#F5EFE4]">
                      {pillar.title}
                    </h3>
                    <div className="text-xs font-mono text-[#A78BFA] mt-1">
                      {pillar.primitive}
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-[#C9BC9F] leading-relaxed">
                    {pillar.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── How It Works (#how-it-works) ─────────────────────────────────── */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 border-b border-[#2A4F39]">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14251B] border border-[#8B5CF6]/30 text-[#A78BFA] text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6]" />
              <span>Examination Protocol Lifecycle</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F5EFE4] mt-3 font-serif">
              How The Examination Protocol Operates
            </h2>
            <p className="text-sm sm:text-base text-[#C9BC9F] mt-3 leading-relaxed">
              From key generation ceremonies to independent candidate Merkle verification, each stage enforces formal cryptographic contracts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {workflowSteps.map((ws) => (
              <div
                key={ws.step}
                className="p-5 rounded-2xl bg-[#14251B]/60 border border-[#2A4F39] flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="text-2xl font-extrabold text-[#A78BFA] font-mono">
                    {ws.step}
                  </div>
                  <h3 className="text-sm font-semibold text-[#F5EFE4] mt-2">
                    {ws.title}
                  </h3>
                  <div className="text-[11px] font-mono text-[#C9BC9F] mt-0.5">
                    {ws.subtitle}
                  </div>
                </div>
                <p className="text-xs text-[#C9BC9F] leading-relaxed">
                  {ws.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Institutional Role Portals (#platform) ───────────────────────── */}
        <section id="platform" className="border-b border-[#2A4F39] bg-[#0F2016]/40 py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-xl mx-auto mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14251B] border border-[#8B5CF6]/30 text-[#A78BFA] text-xs font-mono">
                <span>Role-Based Portals</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F5EFE4] mt-3 font-serif">
                Access System Portals
              </h2>
              <p className="text-sm text-[#C9BC9F] mt-2">
                Select your designated role to enter the secure environment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-[#14251B]/90 border border-[#2A4F39] flex flex-col justify-between space-y-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase text-[#A78BFA] font-semibold tracking-wider">Student Portal</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F3D2B] text-[#E8DCC4] border border-[#2A4F39]">Candidate</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#F5EFE4]">Take Examination</h3>
                  <p className="text-xs sm:text-sm text-[#C9BC9F] mt-2 leading-relaxed">
                    Authenticate with USN, Argon2id credentials, and hardware WebCrypto keys. Access active assessments and verify Merkle inclusion proofs.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white font-semibold text-sm py-2.5 shadow-md shadow-[#8B5CF6]/25 transition-all active:scale-[0.98]"
                >
                  <span>Student Login</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="p-6 rounded-2xl bg-[#14251B]/90 border border-[#2A4F39] flex flex-col justify-between space-y-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase text-[#A78BFA] font-semibold tracking-wider">Examiner Portal</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F3D2B] text-[#E8DCC4] border border-[#2A4F39]">Faculty</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#F5EFE4]">Manage Examinations</h3>
                  <p className="text-xs sm:text-sm text-[#C9BC9F] mt-2 leading-relaxed">
                    Create question banks with AES-256-GCM envelope encryption, conduct Shamir (2-of-3) key ceremonies, and publish commitments.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1F3D2B] hover:bg-[#264934] text-[#E8DCC4] hover:text-white border border-[#2A4F39] font-semibold text-sm py-2.5 shadow-md transition-all active:scale-[0.98]"
                >
                  <span>Examiner Access</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="p-6 rounded-2xl bg-[#14251B]/90 border border-[#2A4F39] flex flex-col justify-between space-y-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono uppercase text-[#A78BFA] font-semibold tracking-wider">Audit Ledger</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F3D2B] text-[#E8DCC4] border border-[#2A4F39]">Auditor</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#F5EFE4]">Verify Audit Log</h3>
                  <p className="text-xs sm:text-sm text-[#C9BC9F] mt-2 leading-relaxed">
                    Browse the immutable SHA-256 hash chain, verify block signatures, and inspect real-time cryptographic benchmark metrics.
                  </p>
                </div>
                <Link
                  href="/audit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14251B] hover:bg-[#1F3D2B] text-[#E8DCC4] hover:text-white border border-[#2A4F39] font-medium text-sm py-2.5 shadow-sm transition-all active:scale-[0.98]"
                >
                  <span>Open Audit Ledger</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── About & Institutional Governance (#about) ───────────────────── */}
        <section id="about" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-[#14251B]/90 via-[#112217]/70 to-[#0C1811] border border-[#2A4F39] text-center max-w-4xl mx-auto space-y-6 shadow-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1F3D2B] border border-[#8B5CF6]/30 text-[#A78BFA] text-xs font-mono">
              <GraduationCap className="w-4 h-4 text-[#A78BFA]" aria-hidden="true" />
              <span>Department of Computer Science &amp; Engineering · KLE Technological University</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F5EFE4] font-serif">
              Academic &amp; Institutional Governance
            </h2>

            <p className="text-xs sm:text-sm text-[#C9BC9F] leading-relaxed max-w-2xl mx-auto">
              Developed as a Cryptography &amp; Network Security (CNS) Capstone Project under the academic guidance of faculty mentor
              <strong className="text-[#F5EFE4] ml-1">Miss Roopa Badami</strong>, Department of Computer Science &amp; Engineering, KLE Technological University. Engineered to demonstrate formal cryptographic verification, mathematical non-repudiation, and tamper-evident audit mechanisms in online examinations.
            </p>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/benchmarks"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1F3D2B] hover:bg-[#264934] text-[#E8DCC4] hover:text-white border border-[#2A4F39] text-xs font-medium transition-all"
              >
                <span>View Cryptographic Benchmarks</span>
              </Link>
              <Link
                href="/audit"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#14251B] hover:bg-[#1F3D2B] text-[#C9BC9F] hover:text-white border border-[#2A4F39] text-xs font-medium transition-all"
              >
                <span>Inspect Ed25519 Chain</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
