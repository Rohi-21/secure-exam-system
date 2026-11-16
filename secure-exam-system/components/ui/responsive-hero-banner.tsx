"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  KeyRound,
  Binary,
  GitCommitHorizontal,
  Lock,
  ArrowRight,
  Menu,
  X,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
  isActive?: boolean;
}

export interface Partner {
  logoUrl: string;
  href: string;
}

export interface CapabilityItem {
  label: string;
  sublabel: string;
  primitive: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface ResponsiveHeroBannerProps {
  logoUrl?: string;
  brandName?: string;
  brandSubtitle?: string;
  backgroundImageUrl?: string;
  navLinks?: NavLink[];
  ctaButtonText?: string;
  ctaButtonHref?: string;
  badgeLabel?: string;
  badgeText?: string;
  title?: string;
  titleLine2?: string;
  description?: string;
  primaryButtonText?: string;
  primaryButtonHref?: string;
  secondaryButtonText?: string;
  secondaryButtonHref?: string;
  partnersTitle?: string;
  partners?: Partner[];
  capabilities?: CapabilityItem[];
  className?: string;
}

const DEFAULT_CAPABILITIES: CapabilityItem[] = [
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

const ResponsiveHeroBanner: React.FC<ResponsiveHeroBannerProps> = ({
  logoUrl,
  brandName = "Secure Exam",
  brandSubtitle = "KLE Tech Dept. of CSE",
  backgroundImageUrl,
  navLinks = [
    { label: "Platform", href: "#platform", isActive: true },
    { label: "Security", href: "#security" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "About", href: "#about" },
  ],
  ctaButtonText = "Access Platform",
  ctaButtonHref = "/login",
  badgeLabel = "Secure Digital Platform",
  badgeText = "Cryptographically Enforced Examination Integrity",
  title = "Examinations Built on Trust.",
  titleLine2 = "Secured by Cryptography.",
  description = "A secure online examination platform designed to protect examination data, preserve answer integrity, and support transparent result verification.",
  primaryButtonText = "Access Platform",
  primaryButtonHref = "/login",
  secondaryButtonText = "Explore Security",
  secondaryButtonHref = "#security",
  partnersTitle = "Cryptographic Security Invariants & System Guarantees",
  partners,
  capabilities = DEFAULT_CAPABILITIES,
  className = "",
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Close mobile menu on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
        toggleButtonRef.current?.focus();
      }
    }
    if (mobileMenuOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock background scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <section
      className={`w-full isolate min-h-screen overflow-hidden relative flex flex-col justify-between bg-slate-950 text-slate-100 ${className}`}
      aria-label="Secure Digital Examination Hero Banner"
    >
      {/* ── Background Layer ─────────────────────────────────────────────── */}
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt=""
          className="w-full h-full object-cover absolute inset-0 z-0 select-none pointer-events-none"
        />
      ) : (
        /* Cinematic Security Mesh & Geometric Overlay */
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
          {/* Deep radial lighting gradient */}
          <div className="absolute -top-[25%] left-1/2 -translate-x-1/2 w-[1200px] h-[750px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-600/18 via-indigo-600/10 to-transparent blur-3xl opacity-80" />
          <div className="absolute -bottom-[20%] right-[-10%] w-[600px] h-[600px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/15 via-transparent to-transparent blur-2xl" />

          {/* Precision Cryptographic Vector Coordinates */}
          <svg
            className="absolute inset-0 w-full h-full opacity-35 stroke-slate-800/60"
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
          >
            <defs>
              <pattern id="sec-grid" width="64" height="64" patternUnits="userSpaceOnUse">
                <path d="M 64 0 L 0 0 0 64" fill="none" strokeWidth="0.75" />
                <circle cx="64" cy="64" r="1" fill="#38bdf8" fillOpacity="0.4" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sec-grid)" />
            {/* Concentric Cryptographic Rings */}
            <circle cx="50%" cy="40%" r="280" fill="none" stroke="#2563eb" strokeWidth="0.75" strokeDasharray="4 8" opacity="0.45" />
            <circle cx="50%" cy="40%" r="420" fill="none" stroke="#6366f1" strokeWidth="0.5" strokeDasharray="6 12" opacity="0.3" />
            <circle cx="50%" cy="40%" r="580" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="3 9" opacity="0.2" />
          </svg>

          {/* Subtle noise and vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/30 to-slate-950" />
        </div>
      )}

      {/* Protective boundary ring */}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/5" aria-hidden="true" />

      {/* ── Glassmorphic Navigation Header ───────────────────────────────── */}
      <header className="z-30 w-full pt-4 sm:pt-5 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Brand Logo & Institutional Identity */}
            <Link
              href="/"
              className="group flex items-center gap-3 rounded-xl p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-transform active:scale-[0.98]"
            >
              {logoUrl ? (
                <div
                  className="w-[100px] h-[38px] bg-center bg-cover rounded"
                  style={{ backgroundImage: `url(${logoUrl})` }}
                  role="img"
                  aria-label={brandName}
                />
              ) : (
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 border border-blue-400/40 flex items-center justify-center shadow-lg shadow-blue-900/30 group-hover:border-blue-400 transition-colors shrink-0">
                  <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
              )}
              <div className="flex flex-col text-left">
                <span className="font-semibold text-slate-100 text-sm tracking-tight group-hover:text-white transition-colors">
                  {brandName}
                </span>
                <span className="text-[11px] text-slate-400 font-mono tracking-tight hidden sm:block">
                  {brandSubtitle}
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Pill */}
            <nav
              className="hidden md:flex items-center gap-1.5"
              aria-label="Hero Main Navigation"
            >
              <div className="flex items-center gap-1 rounded-full bg-slate-900/60 p-1.5 border border-slate-700/60 ring-1 ring-white/10 backdrop-blur-md shadow-2xl shadow-black/40">
                {navLinks.map((link, index) => (
                  <Link
                    key={index}
                    href={link.href}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      link.isActive
                        ? "text-white bg-blue-600/30 border border-blue-400/30 shadow-sm"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href={ctaButtonHref}
                  className="ml-1 inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-[0.97] px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-900/30 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <span>{ctaButtonText}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </nav>

            {/* Mobile Menu Trigger Button */}
            <button
              ref={toggleButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/70 border border-slate-700/60 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-expanded={mobileMenuOpen}
              aria-controls="hero-mobile-nav"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile Accessible Navigation Sheet with Backdrop Scrim ────── */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden animate-fade-slide-in-1"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              id="hero-mobile-nav"
              ref={mobileMenuRef}
              className="md:hidden fixed inset-x-4 top-20 z-50 rounded-2xl bg-slate-900/95 border border-slate-700/80 p-5 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 animate-fade-slide-in-1"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile Navigation"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">
                    Navigation Menu
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ECDH · AES-GCM
                  </span>
                </div>

                {navLinks.map((link, index) => (
                  <Link
                    key={index}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      link.isActive
                        ? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span>{link.label}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  </Link>
                ))}

                <div className="pt-3 border-t border-slate-800 mt-1">
                  <Link
                    href={ctaButtonHref}
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all active:scale-[0.98]"
                  >
                    <span>{ctaButtonText}</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      {/* ── Main Hero Content ─────────────────────────────────────────────── */}
      <div className="z-10 relative flex-1 flex flex-col justify-center">
        <div className="max-w-7xl mx-auto pt-8 sm:pt-10 md:pt-12 pb-8 sm:pb-12 px-4 sm:px-6 lg:px-8 text-center">
          <div className="mx-auto max-w-5xl">
            {/* Announcement Badge */}
            <div className="mb-5 inline-flex items-center gap-2.5 rounded-full bg-slate-900/70 px-3.5 py-1.5 border border-slate-700/60 ring-1 ring-white/10 backdrop-blur-md shadow-xl animate-fade-slide-in-1">
              <span className="inline-flex items-center text-[11px] font-semibold tracking-wider uppercase font-mono text-blue-300 bg-blue-950/80 border border-blue-500/30 rounded-full py-0.5 px-2.5">
                {badgeLabel}
              </span>
              <span className="text-xs sm:text-sm font-medium text-slate-200">
                {badgeText}
              </span>
            </div>

            {/* Authoritative Headline with balanced wrapping */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] font-serif animate-fade-slide-in-2">
              <span className="block sm:inline">{title}</span>{" "}
              <span className="block mt-1 sm:mt-1.5 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-indigo-100 to-white">
                {titleLine2}
              </span>
            </h1>

            {/* Description */}
            <p className="text-base sm:text-lg md:text-xl text-slate-300/90 max-w-2xl mt-5 sm:mt-6 mx-auto leading-relaxed animate-fade-slide-in-3 font-sans">
              {description}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 mt-8 sm:mt-9 animate-fade-slide-in-4">
              <Link
                href={primaryButtonHref}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-[0.97] px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-950/60 ring-1 ring-blue-400/40 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <span>{primaryButtonText}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <Link
                href={secondaryButtonHref}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 backdrop-blur-md active:scale-[0.97] px-6 py-3.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <ShieldCheck className="h-4 w-4 text-blue-400" aria-hidden="true" />
                <span>{secondaryButtonText}</span>
              </Link>
            </div>
          </div>

          {/* ── Cryptographic Capability Strip (Replacing Space Partners) ───── */}
          <div className="mx-auto mt-10 sm:mt-14 max-w-6xl animate-fade-slide-in-5">
            <div className="flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" aria-hidden="true" />
              <span>{partnersTitle}</span>
            </div>

            {/* If traditional image partners are explicitly provided, render logo links */}
            {partners && partners.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 text-white/70 items-center justify-items-center gap-4">
                {partners.map((partner, index) => (
                  <a
                    key={index}
                    href={partner.href}
                    className="inline-flex items-center justify-center bg-center w-[120px] h-[36px] bg-cover rounded-full opacity-80 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    style={{ backgroundImage: `url(${partner.logoUrl})` }}
                  />
                ))}
              </div>
            ) : (
              /* Security Capability Cards Strip with hover lift */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5 text-left">
                {capabilities.map((cap, index) => {
                  const Icon = cap.icon;
                  return (
                    <div
                      key={index}
                      className="group p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-blue-500/40 hover:bg-slate-900/90 hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between shadow-lg shadow-black/20"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-950/80 border border-blue-500/25 flex items-center justify-center text-blue-400 group-hover:border-blue-400/50 transition-colors">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <span className="text-[10px] font-mono text-blue-300 px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-800/50">
                          {cap.primitive}
                        </span>
                      </div>
                      <div>
                        <h2 className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
                          {cap.label}
                        </h2>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug line-clamp-2">
                          {cap.sublabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ResponsiveHeroBanner;
export { ResponsiveHeroBanner };
