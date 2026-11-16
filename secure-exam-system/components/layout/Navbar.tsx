"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface NavbarUser {
  name?: string;
  role?: "student" | "examiner" | "admin" | "hod";
  usn?: string;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<NavbarUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function restoreSession() {
      const win = window as typeof window & { __accessToken?: string };
      if (win.__accessToken) {
        const payload = parseJwtPayload(win.__accessToken);
        if (payload) {
          setUser({
            name: (payload.name as string) || (payload.usn as string) || "User",
            role: payload.role as NavbarUser["role"],
            usn: payload.usn as string,
          });
          return;
        }
      }

      // If no token in memory, attempt silent session refresh via httpOnly refresh cookie
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.accessToken) {
            win.__accessToken = data.accessToken;
            const payload = parseJwtPayload(data.accessToken);
            if (payload) {
              setUser({
                name: (payload.name as string) || (payload.usn as string) || "User",
                role: payload.role as NavbarUser["role"],
                usn: payload.usn as string,
              });
              return;
            }
          }
        }
      } catch {}

      setUser(null);
    }

    restoreSession();
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    (window as typeof window & { __accessToken?: string }).__accessToken = "";
    setUser(null);
    setLoggingOut(false);
    router.push("/login");
  }

  // Define navigation items based on role or context
  const getNavLinks = () => {
    if (user?.role === "admin" || user?.role === "hod") {
      return [
        { label: "Overview", href: "/admin" },
        { label: "User Management", href: "/users" },
        { label: "Audit Log", href: "/audit" },
        { label: "Benchmarks", href: "/benchmarks" },
      ];
    }
    if (user?.role === "examiner") {
      return [
        { label: "All Exams", href: "/exams" },
        { label: "New Exam", href: "/exams/new" },
        { label: "Audit Log", href: "/audit" },
        { label: "Benchmarks", href: "/benchmarks" },
      ];
    }
    if (user?.role === "student") {
      return [
        { label: "Portal Hub", href: "/dashboard" },
        { label: "Results & Proofs", href: "/results" },
        { label: "Audit Chain", href: "/audit" },
      ];
    }
    return [
      { label: "Home", href: "/" },
      { label: "Architecture", href: "/#architecture" },
      { label: "Audit Chain", href: "/audit" },
      { label: "Benchmarks", href: "/benchmarks" },
    ];
  };

  const navLinks = getNavLinks();
  const isAuthenticated = Boolean(user);

  const getRoleBadgeVariant = (role?: string) => {
    switch (role) {
      case "admin":
        return "danger";
      case "examiner":
      case "hod":
        return "purple";
      case "student":
        return "info";
      default:
        return "default";
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand & KLE Tech Institutional Identity */}
          <Link href="/" className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg p-1">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 border border-blue-400/30 flex items-center justify-center shadow-md shadow-blue-900/20 group-hover:border-blue-400/60 transition-colors shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 text-sm tracking-tight group-hover:text-white transition-colors">
                  KLE Tech SecureExam
                </span>
                <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/50">
                  v1.0
                </span>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:block">
                Dept. of Computer Science & Engineering
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
            {navLinks.map((link) => {
              const isActive = link.href === "/exams"
                ? (pathname === "/exams" || (pathname.startsWith("/exams/") && pathname !== "/exams/new"))
                : (pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href + "/")));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                    isActive
                      ? "text-blue-400 bg-blue-950/40 border border-blue-800/40"
                      : "text-slate-300 hover:text-white hover:bg-slate-900/80"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Action & Cryptography Posture Pill */}
          <div className="flex items-center gap-3">
            {/* Cryptographic posture badge */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>ECDH-P256</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">AES-256-GCM</span>
            </div>

            {isAuthenticated ? (
              <div className="flex items-center gap-2.5">
                {user?.role && (
                  <Badge variant={getRoleBadgeVariant(user.role)} size="sm">
                    {user.role.toUpperCase()}
                  </Badge>
                )}
                {user?.usn && (
                  <span className="hidden xl:inline text-xs font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                    {user.usn}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  loading={loggingOut}
                  onClick={handleLogout}
                  className="text-xs text-slate-400 hover:text-red-400 hover:bg-red-950/30"
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button variant="primary" size="sm">
                    Register
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-800 bg-slate-950/95 px-4 pt-3 pb-6 space-y-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive
                    ? "text-blue-400 bg-blue-950/50 border border-blue-800/40"
                    : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>ECDH · AES-GCM · Ed25519</span>
            </div>
            {isAuthenticated && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleLogout}
              >
                Sign Out
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
