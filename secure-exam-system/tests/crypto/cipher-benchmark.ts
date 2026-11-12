/**
 * Cipher Benchmark — AES-256-GCM vs AES-256-CBC vs AES-256-CTR
 *
 * Measures: encryption throughput (MB/s), decryption throughput (MB/s),
 * latency per operation (µs), and authentication overhead (GCM vs CBC+HMAC).
 *
 * Run: npx tsx tests/crypto/cipher-benchmark.ts
 * Output: JSON results printed to stdout + saved to tests/results/cipher-benchmark.json
 */

import { randomBytes, createCipheriv, createDecipheriv, createHmac } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const ITERATIONS = 500;
const PAYLOAD_SIZES = [1024, 16384, 65536, 1048576]; // 1KB, 16KB, 64KB, 1MB

interface BenchmarkResult {
  algorithm: string;
  payloadSizeBytes: number;
  payloadSizeLabel: string;
  encryptionsPerSec: number;
  decryptionsPerSec: number;
  encryptLatencyUs: number;
  decryptLatencyUs: number;
  throughputMBps: number;
  authenticationIncluded: boolean;
  notes: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${bytes / 1048576}MB`;
  if (bytes >= 1024) return `${bytes / 1024}KB`;
  return `${bytes}B`;
}

// ── AES-256-GCM ─────────────────────────────────────────────────────────────

function benchAESGCM(payload: Buffer): { encMs: number; decMs: number } {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  let encMs = 0, decMs = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();
    encMs += performance.now() - t0;

    const t1 = performance.now();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    Buffer.concat([decipher.update(ct), decipher.final()]);
    decMs += performance.now() - t1;
  }
  return { encMs: encMs / ITERATIONS, decMs: decMs / ITERATIONS };
}

// ── AES-256-CBC + HMAC-SHA256 (encrypt-then-MAC) ────────────────────────────

function benchAESCBC(payload: Buffer): { encMs: number; decMs: number } {
  const encKey = randomBytes(32);
  const macKey = randomBytes(32);
  const iv = randomBytes(16);
  let encMs = 0, decMs = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    const cipher = createCipheriv("aes-256-cbc", encKey, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    // Encrypt-then-MAC
    createHmac("sha256", macKey).update(ct).digest();
    encMs += performance.now() - t0;

    const t1 = performance.now();
    const mac = createHmac("sha256", macKey).update(ct).digest();
    // Constant-time MAC verify (simulated — real code uses timingSafeEqual)
    const decipher = createDecipheriv("aes-256-cbc", encKey, iv);
    Buffer.concat([decipher.update(ct), decipher.final()]);
    decMs += performance.now() - t1;
  }
  return { encMs: encMs / ITERATIONS, decMs: decMs / ITERATIONS };
}

// ── AES-256-CTR (stream — no auth, included for throughput comparison) ───────

function benchAESCTR(payload: Buffer): { encMs: number; decMs: number } {
  const key = randomBytes(32);
  const iv = randomBytes(16);
  let encMs = 0, decMs = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    const cipher = createCipheriv("aes-256-ctr", key, iv);
    const ct = Buffer.concat([cipher.update(payload), cipher.final()]);
    encMs += performance.now() - t0;

    const t1 = performance.now();
    const decipher = createDecipheriv("aes-256-ctr", key, iv);
    Buffer.concat([decipher.update(ct), decipher.final()]);
    decMs += performance.now() - t1;
  }
  return { encMs: encMs / ITERATIONS, decMs: decMs / ITERATIONS };
}

// ── Run all benchmarks ────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"─".repeat(80)}`);
  console.log("CNS PROJECT — Cipher Benchmark");
  console.log(`Node.js ${process.version} | Iterations per test: ${ITERATIONS}`);
  console.log(`${"─".repeat(80)}\n`);

  const results: BenchmarkResult[] = [];

  for (const size of PAYLOAD_SIZES) {
    const payload = randomBytes(size);
    const label = formatSize(size);
    console.log(`\n📦 Payload size: ${label}`);

    const benches = [
      { name: "AES-256-GCM", fn: benchAESGCM, auth: true, note: "AEAD — recommended (our choice)" },
      { name: "AES-256-CBC+HMAC", fn: benchAESCBC, auth: true, note: "Encrypt-then-MAC (legacy)" },
      { name: "AES-256-CTR (no auth)", fn: benchAESCTR, auth: false, note: "Stream, no authentication" },
    ];

    for (const { name, fn, auth, note } of benches) {
      const { encMs, decMs } = fn(payload);
      const throughput = size / (encMs / 1000) / (1024 * 1024);

      const result: BenchmarkResult = {
        algorithm: name,
        payloadSizeBytes: size,
        payloadSizeLabel: label,
        encryptionsPerSec: Math.round(1000 / encMs),
        decryptionsPerSec: Math.round(1000 / decMs),
        encryptLatencyUs: Math.round(encMs * 1000),
        decryptLatencyUs: Math.round(decMs * 1000),
        throughputMBps: Math.round(throughput * 100) / 100,
        authenticationIncluded: auth,
        notes: note,
      };
      results.push(result);

      console.log(
        `  ${name.padEnd(22)} | Enc: ${(encMs * 1000).toFixed(1).padStart(8)} µs` +
        ` | Dec: ${(decMs * 1000).toFixed(1).padStart(8)} µs` +
        ` | ${throughput.toFixed(1).padStart(7)} MB/s`
      );
    }
  }

  // ── Save results ─────────────────────────────────────────────────────────
  const outDir = path.resolve("tests/results");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "cipher-benchmark.json");
  writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n✅ Results saved to ${outPath}\n`);
}

main().catch(console.error);
