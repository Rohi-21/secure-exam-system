/**
 * Next.js Edge Middleware — JWT verification + RBAC + rate limiting
 *
 * Runs on the Edge Runtime (not Node.js) — only use Web-compatible APIs.
 * jose (used for JWT) is Edge-compatible. Prisma is NOT — no DB calls here.
 *
 * Protected route rules:
 *   /dashboard/*           → any authenticated user
 *   /exam/*                → student
 *   /examiner/*            → examiner
 *   /admin/*               → admin | hod
 *   /api/exam/*            → authenticated
 *   /api/admin/*           → admin | hod
 *   /api/keys/*            → examiner | admin | hod
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Routes that don't need authentication
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
];

// Role-based access rules — order matters (first match wins)
const RBAC_RULES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin",         roles: ["admin", "hod"] },
  { prefix: "/api/admin",     roles: ["admin", "hod"] },
  { prefix: "/api/keys",      roles: ["examiner", "admin", "hod"] },
  { prefix: "/examiner",      roles: ["examiner", "admin", "hod"] },
  { prefix: "/exam",          roles: ["student"] },
  { prefix: "/dashboard",     roles: ["student", "examiner", "admin", "hod"] },
  { prefix: "/api/exam",      roles: ["student", "examiner", "admin", "hod"] },
];

// Simple in-memory rate limiter (Edge-compatible)
// Key: ip, Value: { count, windowStart }
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 100;          // requests per minute per IP
const AUTH_RATE_LIMIT_MAX = 5;       // for /api/auth/login specifically

function getClientIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true; // allowed
  }

  if (record.count >= max) return false; // blocked

  record.count++;
  return true;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIP(req);

  // ── Rate limiting ─────────────────────────────────────────────────────
  const isAuthRoute = pathname.startsWith("/api/auth/login");
  const rateLimitKey = `${ip}:${isAuthRoute ? "auth" : "general"}`;
  const rateMax = isAuthRoute ? AUTH_RATE_LIMIT_MAX : RATE_LIMIT_MAX;

  if (!checkRateLimit(rateLimitKey, rateMax)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429 }
    );
  }

  // ── Public paths — no auth needed ────────────────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // ── JWT verification ─────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let payload: { userId: string; role: string; usn: string; sessionId: string };
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload: p } = await jwtVerify(token, secret);
    payload = p as typeof payload;
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── RBAC check ────────────────────────────────────────────────────────
  for (const rule of RBAC_RULES) {
    if (pathname.startsWith(rule.prefix)) {
      if (!rule.roles.includes(payload.role)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
      break;
    }
  }

  // ── Pass user info to API routes via headers ──────────────────────────
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", payload.userId);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-usn", payload.usn);
  requestHeaders.set("x-session-id", payload.sessionId);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
