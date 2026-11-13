/**
 * Cipher Benchmark — AES-256-GCM vs AES-256-CBC vs AES-256-CTR
 *
 * Cryptographic rigor:
 * - Fresh 96-bit random nonce generated for EVERY single iteration of AES-GCM (no nonce reuse).
 * - Fresh 128-bit random IV generated for EVERY iteration of AES-CBC and AES-CTR.
 * - Explicit timing-safe HMAC verification (crypto.timingSafeEqual) for CBC+HMAC decrypt.
 * - Warm-up iterations before timing to allow V8 JIT optimization.
 * - Statistical dispersion: reports mean, median, standard deviation, and p95 latency.
 *
 * Run: npx tsx tests/crypto/cipher-benchmark.ts
 * Output: JSON saved to tests/results/cipher-benchmark.json
 */

import { randomBytes, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const WARMUP_ITERATIONS = 20;
const BENCH_ITERATIONS = 300;
const PAYLOAD_SIZES = [1024, 16384, 65536, 1048576]; // 1KB, 16KB, 64KB, 1MB

interface LatencyStats {
  meanMs: number;
  medianMs: number;
  stdDevMs: number;
  p95Ms: number;
}

interface BenchmarkResult {
  algorithm: string;
  payloadSizeBytes: number;
  payloadSizeLabel: string;
  iterations: number;
  encryptionsPerSec: number;
  decryptionsPerSec: number;
  encryptStatsUs: { mean: number; median: number; stdDev: number; p95: number };
  decryptStatsUs: { mean: number; median: number; stdDev: number; p95: number };
  throughputMBps: number;
  authenticationIncluded: boolean;
  notes: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${bytes / 1048576}MB`;
  if (bytes >= 1024) return `${bytes / 1024}KB`;
  return `${bytes}B`;
}

function calculateStats(timesMs: number[]): LatencyStats {
  const n = timesMs.length;
  const mean = timesMs.reduce((a, b) => a + b, 0) / n;
  const sorted = [...timesMs].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const variance = timesMs.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const p95 = sorted[Math.floor(n * 0.95)];
  return { meanMs: mean, medianMs: median, stdDevMs: stdDev, p95Ms: p95 };
}

// ── AES-256-GCM Benchmark ───────────────────────────────────────────────────

function benchAESGCM(payload: Buffer): { enc: LatencyStats; dec: LatencyStats } {
  const key = randomBytes(32);

  // Warm-up
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([c.update(payload), c.final()]);
    const tag = c.getAuthTag();
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    Buffer.concat([d.update(ct), d.final()]);
  }

  const encTimes: number[] = [];
  const decTimes: number[] = [];

  for (let i = 0; i < BENCH_ITERATIONS; i++) {
    // FRESH 96-bit random nonce for EVERY iteration
    const iv = randomBytes(12);

    const t0 = performance.now();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();
    encTimes.push(performance.now() - t0);

    const t1 = performance.now();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    Buffer.concat([decipher.update(ct), decipher.final()]);
    decTimes.push(performance.now() - t1);
  }

  return { enc: calculateStats(encTimes), dec: calculateStats(decTimes) };
}

// ── AES-256-CBC + HMAC-SHA256 (Encrypt-then-MAC) Benchmark ─────────────────

function benchAESCBC(payload: Buffer): { enc: LatencyStats; dec: LatencyStats } {
  const encKey = randomBytes(32);
  const macKey = randomBytes(32);

  // Warm-up
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    const iv = randomBytes(16);
    const c = createCipheriv("aes-256-cbc", encKey, iv);
    const ct = Buffer.concat([c.update(payload), c.final()]);
    const mac = createHmac("sha256", macKey).update(ct).digest();
    const vMac = createHmac("sha256", macKey).update(ct).digest();
    timingSafeEqual(mac, vMac);
    const d = createDecipheriv("aes-256-cbc", encKey, iv);
    Buffer.concat([d.update(ct), d.final()]);
  }

  const encTimes: number[] = [];
  const decTimes: number[] = [];

  for (let i = 0; i < BENCH_ITERATIONS; i++) {
    // FRESH 128-bit IV for EVERY iteration
    const iv = randomBytes(16);

    const t0 = performance.now();
    const cipher = createCipheriv("aes-256-cbc", encKey, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    const mac = createHmac("sha256", macKey).update(ct).digest();
    encTimes.push(performance.now() - t0);

    const t1 = performance.now();
    const expectedMac = createHmac("sha256", macKey).update(ct).digest();
    const valid = timingSafeEqual(mac, expectedMac);
    if (!valid) throw new Error("MAC mismatch in CBC benchmark");
    const decipher = createDecipheriv("aes-256-cbc", encKey, iv);
    Buffer.concat([decipher.update(ct), decipher.final()]);
    decTimes.push(performance.now() - t1);
  }

  return { enc: calculateStats(encTimes), dec: calculateStats(decTimes) };
}

// ── AES-256-CTR (Stream Mode - Unauthenticated baseline) ───────────────────

function benchAESCTR(payload: Buffer): { enc: LatencyStats; dec: LatencyStats } {
  const key = randomBytes(32);

  // Warm-up
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    const iv = randomBytes(16);
    const c = createCipheriv("aes-256-ctr", key, iv);
    const ct = Buffer.concat([c.update(payload), c.final()]);
    const d = createDecipheriv("aes-256-ctr", key, iv);
    Buffer.concat([d.update(ct), d.final()]);
  }

  const encTimes: number[] = [];
  const decTimes: number[] = [];

  for (let i = 0; i < BENCH_ITERATIONS; i++) {
    const iv = randomBytes(16);

    const t0 = performance.now();
    const cipher = createCipheriv("aes-256-ctr", key, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    encTimes.push(performance.now() - t0);

    const t1 = performance.now();
    const decipher = createDecipheriv("aes-256-ctr", key, iv);
    Buffer.concat([decipher.update(ct), decipher.final()]);
    decTimes.push(performance.now() - t1);
  }

  return { enc: calculateStats(encTimes), dec: calculateStats(decTimes) };
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function runCipherBenchmark() {
  console.log("================================================================================");
  console.log("  CNS CIPHER BENCHMARK: AES-256-GCM vs CBC-HMAC vs CTR");
  console.log(`  Iterations: ${BENCH_ITERATIONS} per size | Warmup: ${WARMUP_ITERATIONS} | Fresh nonces per iteration`);
  console.log("================================================================================\n");

  const results: BenchmarkResult[] = [];

  for (const size of PAYLOAD_SIZES) {
    const payload = randomBytes(size);
    const label = formatSize(size);
    console.log(`Benchmarking payload: ${label} (${size.toLocaleString()} bytes)...`);

    // 1. GCM
    const gcm = benchAESGCM(payload);
    const gcmEncSec = 1000 / gcm.enc.medianMs;
    const gcmDecSec = 1000 / gcm.dec.medianMs;
    const gcmThroughput = (size * gcmEncSec) / (1024 * 1024);

    results.push({
      algorithm: "AES-256-GCM",
      payloadSizeBytes: size,
      payloadSizeLabel: label,
      iterations: BENCH_ITERATIONS,
      encryptionsPerSec: Math.round(gcmEncSec),
      decryptionsPerSec: Math.round(gcmDecSec),
      encryptStatsUs: {
        mean: Math.round(gcm.enc.meanMs * 1000),
        median: Math.round(gcm.enc.medianMs * 1000),
        stdDev: Math.round(gcm.enc.stdDevMs * 1000),
        p95: Math.round(gcm.enc.p95Ms * 1000),
      },
      decryptStatsUs: {
        mean: Math.round(gcm.dec.meanMs * 1000),
        median: Math.round(gcm.dec.medianMs * 1000),
        stdDev: Math.round(gcm.dec.stdDevMs * 1000),
        p95: Math.round(gcm.dec.p95Ms * 1000),
      },
      throughputMBps: Math.round(gcmThroughput * 10) / 10,
      authenticationIncluded: true,
      notes: "Authenticated AEAD (GHASH hardware accelerated via CLMUL/AES-NI). Preferred.",
    });

    // 2. CBC + HMAC
    const cbc = benchAESCBC(payload);
    const cbcEncSec = 1000 / cbc.enc.medianMs;
    const cbcDecSec = 1000 / cbc.dec.medianMs;
    const cbcThroughput = (size * cbcEncSec) / (1024 * 1024);

    results.push({
      algorithm: "AES-256-CBC + HMAC-SHA256",
      payloadSizeBytes: size,
      payloadSizeLabel: label,
      iterations: BENCH_ITERATIONS,
      encryptionsPerSec: Math.round(cbcEncSec),
      decryptionsPerSec: Math.round(cbcDecSec),
      encryptStatsUs: {
        mean: Math.round(cbc.enc.meanMs * 1000),
        median: Math.round(cbc.enc.medianMs * 1000),
        stdDev: Math.round(cbc.enc.stdDevMs * 1000),
        p95: Math.round(cbc.enc.p95Ms * 1000),
      },
      decryptStatsUs: {
        mean: Math.round(cbc.dec.meanMs * 1000),
        median: Math.round(cbc.dec.medianMs * 1000),
        stdDev: Math.round(cbc.dec.stdDevMs * 1000),
        p95: Math.round(cbc.dec.p95Ms * 1000),
      },
      throughputMBps: Math.round(cbcThroughput * 10) / 10,
      authenticationIncluded: true,
      notes: "Encrypt-then-MAC composite. Requires two independent cryptographic passes.",
    });

    // 3. CTR (baseline)
    const ctr = benchAESCTR(payload);
    const ctrEncSec = 1000 / ctr.enc.medianMs;
    const ctrDecSec = 1000 / ctr.dec.medianMs;
    const ctrThroughput = (size * ctrEncSec) / (1024 * 1024);

    results.push({
      algorithm: "AES-256-CTR",
      payloadSizeBytes: size,
      payloadSizeLabel: label,
      iterations: BENCH_ITERATIONS,
      encryptionsPerSec: Math.round(ctrEncSec),
      decryptionsPerSec: Math.round(ctrDecSec),
      encryptStatsUs: {
        mean: Math.round(ctr.enc.meanMs * 1000),
        median: Math.round(ctr.enc.medianMs * 1000),
        stdDev: Math.round(ctr.enc.stdDevMs * 1000),
        p95: Math.round(ctr.enc.p95Ms * 1000),
      },
      decryptStatsUs: {
        mean: Math.round(ctr.dec.meanMs * 1000),
        median: Math.round(ctr.dec.medianMs * 1000),
        stdDev: Math.round(ctr.dec.stdDevMs * 1000),
        p95: Math.round(ctr.dec.p95Ms * 1000),
      },
      throughputMBps: Math.round(ctrThroughput * 10) / 10,
      authenticationIncluded: false,
      notes: "Stream cipher mode without authentication. For throughput comparison only.",
    });
  }

  // Print summary table
  console.log("\n================================================================================");
  console.log("  BENCHMARK SUMMARY (Median Latency & Throughput)");
  console.log("================================================================================");
  console.table(
    results.map((r) => ({
      Algorithm: r.algorithm,
      Size: r.payloadSizeLabel,
      "Throughput (MB/s)": r.throughputMBps,
      "Enc Median (µs)": r.encryptStatsUs.median,
      "Enc p95 (µs)": r.encryptStatsUs.p95,
      "Auth Included": r.authenticationIncluded ? "YES" : "NO",
    }))
  );

  // Write results JSON
  const outDir = path.resolve("tests/results");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "cipher-benchmark.json");
  writeFileSync(outFile, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nResults written to: ${outFile}`);
}

runCipherBenchmark().catch(console.error);
