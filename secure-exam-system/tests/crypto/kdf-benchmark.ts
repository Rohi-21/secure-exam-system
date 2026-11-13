/**
 * KDF Benchmark — Argon2id vs PBKDF2-SHA256 vs bcrypt
 *
 * Measures: execution latency (ms), statistical dispersion (median, mean, stdDev, p95),
 * throughput (ops/sec), and RFC/NIST recommendation compliance.
 *
 * Cryptographic rigor:
 * - Warm-up iterations to minimize cold-start and GC jitter.
 * - Argon2id memory-hard verification (RFC 9106, 64MB memory cost).
 * - Statistical distribution across repeated iterations.
 *
 * Run: npx tsx tests/crypto/kdf-benchmark.ts
 * Output: JSON saved to tests/results/kdf-benchmark.json
 */

import argon2 from "argon2";
import bcrypt from "bcrypt";
import { pbkdf2Sync, randomBytes } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const TEST_PASSWORD = "BenchmarkPassword@CNS2026!";
const ARGON2_ITERATIONS = 8;
const PBKDF2_ITERATIONS = 15;
const BCRYPT_ITERATIONS = 6;

interface LatencyStats {
  meanMs: number;
  medianMs: number;
  stdDevMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

interface KDFResult {
  algorithm: string;
  parameters: Record<string, number | string>;
  iterationsMeasured: number;
  statsMs: LatencyStats;
  opsPerSec: number;
  memoryMB: number | string;
  rfcCompliant: boolean;
  recommendation: string;
  hashSample: string;
}

function calculateStats(timesMs: number[]): LatencyStats {
  const n = timesMs.length;
  const mean = timesMs.reduce((a, b) => a + b, 0) / n;
  const sorted = [...timesMs].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const variance = timesMs.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const p95 = sorted[Math.floor(n * 0.95)];
  return {
    meanMs: Math.round(mean * 100) / 100,
    medianMs: Math.round(median * 100) / 100,
    stdDevMs: Math.round(stdDev * 100) / 100,
    p95Ms: Math.round(p95 * 100) / 100,
    minMs: Math.round(sorted[0] * 100) / 100,
    maxMs: Math.round(sorted[n - 1] * 100) / 100,
  };
}

// ── Argon2id Benchmark (RFC 9106) ──────────────────────────────────────────

async function benchArgon2id(): Promise<KDFResult> {
  const params = { memoryCost: 65536, timeCost: 3, parallelism: 4 };

  // Warm-up (2 iterations)
  for (let i = 0; i < 2; i++) {
    await argon2.hash(TEST_PASSWORD, { ...params, type: argon2.argon2id as 0 | 1 | 2 });
  }

  const times: number[] = [];
  for (let i = 0; i < ARGON2_ITERATIONS; i++) {
    const t0 = performance.now();
    await argon2.hash(TEST_PASSWORD, { ...params, type: argon2.argon2id as 0 | 1 | 2 });
    times.push(performance.now() - t0);
  }

  const sample = await argon2.hash(TEST_PASSWORD, { ...params, type: argon2.argon2id as 0 | 1 | 2 });
  const stats = calculateStats(times);

  return {
    algorithm: "Argon2id (RFC 9106)",
    parameters: {
      memoryCost_KB: params.memoryCost,
      timeCost: params.timeCost,
      parallelism: params.parallelism,
    },
    iterationsMeasured: ARGON2_ITERATIONS,
    statsMs: stats,
    opsPerSec: Math.round((1000 / stats.medianMs) * 100) / 100,
    memoryMB: params.memoryCost / 1024,
    rfcCompliant: true,
    recommendation: "SELECTED — Memory-hard construction resistant to GPU/FPGA/ASIC parallel cracking.",
    hashSample: sample.slice(0, 45) + "…",
  };
}

// ── PBKDF2-SHA256 Benchmark ────────────────────────────────────────────────

function benchPBKDF2(iterations: number): KDFResult {
  const salt = randomBytes(32);

  // Warm-up
  for (let i = 0; i < 3; i++) {
    pbkdf2Sync(TEST_PASSWORD, salt, iterations, 32, "sha256");
  }

  const times: number[] = [];
  for (let i = 0; i < PBKDF2_ITERATIONS; i++) {
    const freshSalt = randomBytes(32);
    const t0 = performance.now();
    pbkdf2Sync(TEST_PASSWORD, freshSalt, iterations, 32, "sha256");
    times.push(performance.now() - t0);
  }

  const sample = pbkdf2Sync(TEST_PASSWORD, salt, iterations, 32, "sha256").toString("hex");
  const stats = calculateStats(times);

  return {
    algorithm: `PBKDF2-SHA256 (${(iterations / 1000).toFixed(0)}K iter)`,
    parameters: { iterations, keyLength: 32, digest: "SHA-256" },
    iterationsMeasured: PBKDF2_ITERATIONS,
    statsMs: stats,
    opsPerSec: Math.round((1000 / stats.medianMs) * 100) / 100,
    memoryMB: "~0 (CPU-only)",
    rfcCompliant: true,
    recommendation:
      iterations >= 600000
        ? "Meets NIST SP 800-132 iteration recommendation, but lacks memory-hardness against GPU acceleration."
        : "Below NIST minimum (600,000 iterations for SHA-256). Vulnerable to dictionary attacks.",
    hashSample: sample.slice(0, 45) + "…",
  };
}

// ── bcrypt Benchmark ───────────────────────────────────────────────────────

async function benchBcrypt(rounds: number): Promise<KDFResult> {
  // Warm-up
  await bcrypt.hash(TEST_PASSWORD, rounds);

  const times: number[] = [];
  for (let i = 0; i < BCRYPT_ITERATIONS; i++) {
    const t0 = performance.now();
    await bcrypt.hash(TEST_PASSWORD, rounds);
    times.push(performance.now() - t0);
  }

  const sample = await bcrypt.hash(TEST_PASSWORD, rounds);
  const stats = calculateStats(times);

  return {
    algorithm: `bcrypt (work factor ${rounds})`,
    parameters: { costFactor: rounds, outputLength: 60 },
    iterationsMeasured: BCRYPT_ITERATIONS,
    statsMs: stats,
    opsPerSec: Math.round((1000 / stats.medianMs) * 100) / 100,
    memoryMB: "0.004 (4KB Blowfish table)",
    rfcCompliant: false,
    recommendation: "Classic password hash. Fixed 4KB memory cost makes it vulnerable to modern GPU clusters.",
    hashSample: sample.slice(0, 45) + "…",
  };
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function runKDFBenchmark() {
  console.log("================================================================================");
  console.log("  CNS KDF BENCHMARK: Argon2id vs PBKDF2 vs bcrypt");
  console.log("  Evaluating computational latency, memory footprint, and resistance properties");
  console.log("================================================================================\n");

  const results: KDFResult[] = [];

  console.log("1. Benchmarking Argon2id (RFC 9106 recommended profile: 64MB RAM, 3 passes, 4 threads)...");
  results.push(await benchArgon2id());

  console.log("2. Benchmarking PBKDF2-SHA256 (600,000 iterations — NIST SP 800-132)...");
  results.push(benchPBKDF2(600_000));

  console.log("3. Benchmarking PBKDF2-SHA256 (100,000 iterations — legacy)...");
  results.push(benchPBKDF2(100_000));

  console.log("4. Benchmarking bcrypt (cost factor 12)...");
  results.push(await benchBcrypt(12));

  console.log("\n================================================================================");
  console.log("  KDF BENCHMARK SUMMARY (Median Latency, Throughput & Memory)");
  console.log("================================================================================");
  console.table(
    results.map((r) => ({
      Algorithm: r.algorithm,
      "Median Latency (ms)": r.statsMs.medianMs,
      "StdDev (ms)": r.statsMs.stdDevMs,
      "Ops / Sec": r.opsPerSec,
      "Memory Cost": typeof r.memoryMB === "number" ? `${r.memoryMB} MB` : r.memoryMB,
      RFC: r.rfcCompliant ? "YES" : "NO",
    }))
  );

  // Write results JSON
  const outDir = path.resolve("tests/results");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "kdf-benchmark.json");
  writeFileSync(outFile, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nResults written to: ${outFile}`);
}

runKDFBenchmark().catch(console.error);
