/**
 * KDF Benchmark — Argon2id vs PBKDF2-SHA256 vs bcrypt
 *
 * Measures: hash time (ms), memory usage (MB), operations/sec,
 * security rating relative to NIST/RFC recommendations.
 *
 * Run: npx tsx tests/crypto/kdf-benchmark.ts
 * Output: JSON results to tests/results/kdf-benchmark.json
 */

import argon2 from "argon2";
import bcrypt from "bcrypt";
import { pbkdf2Sync, randomBytes } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const TEST_PASSWORD = "BenchmarkPassword@CNS2024!";
const ITERATIONS_CHEAP = 10; // KDFs are intentionally slow

interface KDFResult {
  algorithm: string;
  parameters: Record<string, number | string>;
  avgHashMs: number;
  opsPerSec: number;
  memoryMB: number | string;
  rfcCompliant: boolean;
  recommendation: string;
  hashSample: string;
}

// ── Argon2id — RFC 9106 ───────────────────────────────────────────────────────
async function benchArgon2id(): Promise<KDFResult> {
  const params = { memoryCost: 65536, timeCost: 3, parallelism: 4 };
  const times: number[] = [];

  for (let i = 0; i < ITERATIONS_CHEAP; i++) {
    const t0 = performance.now();
    await argon2.hash(TEST_PASSWORD, { ...params, type: argon2.argon2id as 0|1|2 });
    times.push(performance.now() - t0);
  }

  const sample = await argon2.hash(TEST_PASSWORD, { ...params, type: argon2.argon2id as 0|1|2 });
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  return {
    algorithm: "Argon2id",
    parameters: { memoryCost_KB: params.memoryCost, timeCost: params.timeCost, parallelism: params.parallelism },
    avgHashMs: Math.round(avg * 100) / 100,
    opsPerSec: Math.round(1000 / avg * 100) / 100,
    memoryMB: params.memoryCost / 1024,
    rfcCompliant: true,
    recommendation: "✅ OUR CHOICE — RFC 9106 compliant. Best resistance to GPU/ASIC attacks.",
    hashSample: sample.slice(0, 40) + "…",
  };
}

// ── PBKDF2-SHA256 — NIST SP 800-132 ─────────────────────────────────────────
function benchPBKDF2(iterations: number): KDFResult {
  const times: number[] = [];
  const salt = randomBytes(32);

  for (let i = 0; i < ITERATIONS_CHEAP; i++) {
    const t0 = performance.now();
    pbkdf2Sync(TEST_PASSWORD, salt, iterations, 32, "sha256");
    times.push(performance.now() - t0);
  }

  const sample = pbkdf2Sync(TEST_PASSWORD, salt, iterations, 32, "sha256").toString("hex");
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  return {
    algorithm: `PBKDF2-SHA256 (${(iterations / 1000).toFixed(0)}K iter)`,
    parameters: { iterations, keyLength: 32, digest: "SHA-256" },
    avgHashMs: Math.round(avg * 100) / 100,
    opsPerSec: Math.round(1000 / avg * 100) / 100,
    memoryMB: "~0 (CPU-only)",
    rfcCompliant: true,
    recommendation: iterations >= 600000
      ? "⚠️  NIST min 600K iterations for SHA-256. CPU-only — vulnerable to GPU attacks."
      : "❌ Below NIST minimum (600K iterations for SHA-256). Insufficient.",
    hashSample: sample.slice(0, 40) + "…",
  };
}

// ── bcrypt — cost factor comparison ──────────────────────────────────────────
async function benchBcrypt(rounds: number): Promise<KDFResult> {
  const times: number[] = [];

  for (let i = 0; i < Math.min(ITERATIONS_CHEAP, 5); i++) {
    const t0 = performance.now();
    await bcrypt.hash(TEST_PASSWORD, rounds);
    times.push(performance.now() - t0);
  }

  const sample = await bcrypt.hash(TEST_PASSWORD, rounds);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  return {
    algorithm: `bcrypt (cost ${rounds})`,
    parameters: { costFactor: rounds, outputLength: 60 },
    avgHashMs: Math.round(avg * 100) / 100,
    opsPerSec: Math.round(1000 / avg * 100) / 100,
    memoryMB: "4KB (fixed — not memory-hard by modern standards)",
    rfcCompliant: false,
    recommendation: rounds >= 12
      ? "⚠️  Acceptable legacy choice. Fixed 4KB memory — vulnerable to ASIC. Prefer Argon2id."
      : "❌ Cost factor too low. Minimum recommended: 12.",
    hashSample: sample.slice(0, 40) + "…",
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"─".repeat(80)}`);
  console.log("CNS PROJECT — KDF Benchmark");
  console.log(`Node.js ${process.version} | Iterations: ${ITERATIONS_CHEAP} per algorithm`);
  console.log(`${"─".repeat(80)}\n`);

  const results: KDFResult[] = await Promise.all([
    benchArgon2id(),
    Promise.resolve(benchPBKDF2(100_000)),
    Promise.resolve(benchPBKDF2(600_000)),
    benchBcrypt(10),
    benchBcrypt(12),
  ]);

  // Print table
  console.log("Algorithm".padEnd(32) + "Avg Hash (ms)".padEnd(16) + "Ops/sec".padEnd(12) + "Memory");
  console.log("─".repeat(72));
  for (const r of results) {
    console.log(
      r.algorithm.padEnd(32) +
      r.avgHashMs.toFixed(1).padEnd(16) +
      r.opsPerSec.toFixed(2).padEnd(12) +
      String(r.memoryMB)
    );
  }

  console.log("\nRecommendations:");
  for (const r of results) {
    console.log(`  ${r.algorithm}: ${r.recommendation}`);
  }

  const outDir = path.resolve("tests/results");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "kdf-benchmark.json");
  writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n✅ Results saved to ${outPath}\n`);
}

main().catch(console.error);
