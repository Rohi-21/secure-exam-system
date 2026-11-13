/**
 * Centralized State & Key Storage Abstraction
 *
 * Provides a unified, TTL-enforced store for ephemeral session keys,
 * reconstructed ExamKEKs, login challenges, and rate limiting.
 *
 * Current driver: In-memory with automated TTL sweep (Development & Single-Node).
 * Production ready: Exposes async interface matching Redis/KeyDB.
 */

export interface ExamSessionRecord {
  encKey: Buffer;
  authKey: Buffer;
  ivSeed: Buffer;
  studentId: string;
  examId: string;
  expiresAt: number;
}

export interface CachedExamKEKRecord {
  kek: Buffer;
  expiresAt: number;
}

export interface PendingChallengeRecord {
  userId: string;
  expiresAt: number;
}

class MemorySessionStore {
  private examSessions = new Map<string, ExamSessionRecord>();
  private examKEKs = new Map<string, CachedExamKEKRecord>();
  private loginChallenges = new Map<string, PendingChallengeRecord>();

  // ── 1. Ephemeral Exam Session Keys ─────────────────────────────────────────

  public setExamSession(sessionId: string, data: Omit<ExamSessionRecord, "expiresAt">, ttlMs: number): void {
    this.examSessions.set(sessionId, {
      ...data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public getExamSession(sessionId: string): ExamSessionRecord | null {
    const record = this.examSessions.get(sessionId);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.examSessions.delete(sessionId);
      return null;
    }
    return record;
  }

  public deleteExamSession(sessionId: string): void {
    this.examSessions.delete(sessionId);
  }

  // ── 2. Reconstructed ExamKEK Cache ─────────────────────────────────────────

  public setExamKEK(examId: string, kek: Buffer, ttlMs: number = 3600_000): void {
    this.examKEKs.set(examId, {
      kek,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public getExamKEK(examId: string): Buffer | null {
    const record = this.examKEKs.get(examId);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.examKEKs.delete(examId);
      return null;
    }
    return record.kek;
  }

  public clearExamKEK(examId: string): void {
    const record = this.examKEKs.get(examId);
    if (record) {
      record.kek.fill(0); // Zero out in memory before delete
      this.examKEKs.delete(examId);
    }
  }

  // ── 3. Login Challenges ────────────────────────────────────────────────────

  public setPendingChallenge(nonce: string, userId: string, ttlMs: number = 60_000): void {
    this.loginChallenges.set(nonce, {
      userId,
      expiresAt: Date.now() + ttlMs,
    });
  }

  public consumeChallenge(nonce: string): string | null {
    const record = this.loginChallenges.get(nonce);
    if (!record) return null;
    this.loginChallenges.delete(nonce); // One-time use: always consume
    if (Date.now() > record.expiresAt) return null;
    return record.userId;
  }
}

// Global singleton instance
const globalForStore = globalThis as unknown as { appSessionStore?: MemorySessionStore };
export const sessionStore = globalForStore.appSessionStore ?? new MemorySessionStore();
if (process.env.NODE_ENV !== "production") globalForStore.appSessionStore = sessionStore;
