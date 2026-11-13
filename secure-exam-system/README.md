# Secure Online Examination System Using Cryptography

> **KLE Technological University** | Dept. of Computer Science & Engineering
> Subject: Cryptography and Network Security (CNS)
> Guide: Miss Roopa Badami

## Team

| Name | Roll | USN | Role |
|------|------|-----|------|
| K Rohidas Shenoy | 107 | 01FE23BCS240 | Backend, Crypto Engine |
| Archana K | 152 | 01FE23BCS258 | Frontend |
| Spoorthi L C | 162 | 01FE23BCS255 | Database, Shamir, Audit |
| Sanathkumar B B | 109 | 01FE23BCS042 | Integration, Testing, Benchmarks |

---

## Overview

A research-grade examination platform that demonstrates meaningful cryptographic mechanisms through a fully functional MCQ examination system. Every security property is implemented in code, testable, and benchmarked.

**Not** a CRUD app with hashed passwords — every layer of data storage, delivery, and verification is cryptographically protected.

---

## Cryptographic Architecture (4-Level Key Hierarchy)

```
L1  ExamKEK  = randomBytes(32)          per-exam, never stored plaintext
     → Shamir 2-of-3: each share AES-GCM(Argon2id(trustee_pass, salt))
     → RSA-OAEP-SHA256(ExaminerPublicKey, ExamKEK)   [backup path]

L2  DEK      = randomBytes(32)          per asset (question / submission / result)
     → AES-GCM(ExamKEK, DEK) stored in DB (WrappedDEK fields)

L3  SessionKey = ECDH-P256 → HKDF-SHA256 → {K_enc[32B], K_auth[32B], K_iv[16B]}
     ephemeral per student session, never stored

L4  DraftKey = WebCrypto.generateKey(AES-GCM, non-exportable)
     browser-only, used for in-progress answer autosave
```

---

## Security Properties Demonstrated

| Property | Mechanism | Standard |
|----------|-----------|----------|
| Confidentiality | AES-256-GCM | NIST SP 800-38D |
| Authenticated Encryption | GCM authentication tag | NIST SP 800-38D |
| Password Hashing | Argon2id (64MB, t=3, p=4) | RFC 9106 |
| Key Derivation | HKDF-SHA256 | RFC 5869 |
| Key Wrapping | RSA-OAEP-SHA256 | RFC 8017 |
| Secret Splitting | Shamir's 2-of-3 SSS | Shamir (1979) |
| Digital Signatures | Ed25519 (audit), ECDSA-P256 (submissions) | RFC 8032 |
| Key Exchange | ECDH-P256 + HKDF (application-layer PFS) | NIST SP 800-56A |
| 2FA | Argon2id password + TOTP (RFC 6238) + Ed25519 device key | RFC 6238 |
| Tamper Evidence | SHA-256 hash chain + Ed25519 signatures | Custom |
| Integrity Proofs | Merkle tree (SHA-256, domain-separated) | Bitcoin-style |
| Commit-Reveal | SHA-256(canonical_answers ‖ salt) | Cryptographic commitment |
| Steganography | Unicode ZWC per-student watermark | Custom |

---

## Milestone History

| Tag | Description |
|-----|-------------|
| `milestone-1-foundation` | Next.js scaffold, Prisma schema (17 tables), 11 crypto modules |
| `milestone-2-auth` | Argon2id + TOTP + Ed25519 2FA, JWT + refresh rotation, middleware RBAC |
| `milestone-3-exam-lifecycle` | Exam create, paper upload, ECDH handshake, question delivery, submission |
| `milestone-4-integrity` | Shamir reconstruction, auto-grader, Merkle finalization, commit-reveal, audit chain |
| `milestone-5-research` | Benchmarks (cipher+KDF), 56 tests, seed script, benchmark dashboard |
| `milestone-6-final` | Complete UI flows, architecture docs, final build |
| **`stage-7-complete`** | **Security audit corrections: ECDH contract, header separation, canonical signing, IndexedDB key persistence, trustee authorization, Merkle result proofs, audit chain export fix, TypeScript clean, 62/62 tests** |

---

## Setup

```powershell
# 1. Install dependencies
npm install

# 2. Generate server keys and add to .env.local
npm run generate-keys

# 3. Set up database
npx prisma migrate dev

# 4. Seed demo data
npm run seed

# 5. Start dev server
npm run dev
```

### Environment Variables

Copy `.env.local.template` to `.env.local` and fill in the generated keys.

---

## Running Tests

```powershell
# All 62 tests (8 suites)
npm test

# Crypto tests only (Merkle, Shamir, Commitment)
npm run test:crypto

# Security tests (Audit chain, ECDH PFS, Watermark)
npm run test:security

# Stage 7 integration tests (ECDH contract, canonicalization, ECDSA, Shamir, audit chain)
npm run test:integration

# End-to-end cryptographic lifecycle
npm run test:e2e
```

## Running Benchmarks

```powershell
# AES-256-GCM vs AES-256-CBC+HMAC vs AES-256-CTR
npm run bench:cipher

# Argon2id vs PBKDF2 vs bcrypt
npm run bench:kdf
```

Results saved to `tests/results/` and viewable at `/benchmarks`.

---

## Benchmark Results (Node.js v22, Windows 11)

### Cipher Throughput (1MB payload)

| Algorithm | Throughput | Auth | Notes |
|-----------|-----------|------|-------|
| **AES-256-GCM** | **~950 MB/s** | ✅ AEAD | **Our choice** |
| AES-256-CBC+HMAC | ~460 MB/s | ✅ Encrypt-then-MAC | Legacy |
| AES-256-CTR | ~1024 MB/s | ❌ None | Stream, no auth |

### KDF Comparison

| Algorithm | Avg Hash | Memory | Standard |
|-----------|---------|--------|----------|
| **Argon2id** | **~280ms** | **64MB** | **RFC 9106 ✅ Our choice** |
| PBKDF2-SHA256 (600K) | ~173ms | ~0 | NIST SP 800-132 ⚠️ |
| bcrypt (cost 12) | ~224ms | 4KB fixed | Non-standard ⚠️ |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register with Argon2id + TOTP |
| POST | `/api/auth/login` | Phase 1: password + TOTP |
| POST | `/api/auth/login/challenge` | Phase 2: Ed25519 device binding |
| POST | `/api/admin/users` | Admin-only user provisioning |
| GET  | `/api/exam` | List exams (student/examiner) |
| POST | `/api/exam/create` | Create exam + Shamir KEK split |
| POST | `/api/exam/[id]/upload-paper` | Encrypt + watermark questions |
| POST | `/api/exam/[id]/ecdh-handshake` | Establish ECDH session key |
| GET  | `/api/exam/[id]/questions` | Decrypt + re-encrypt for session |
| POST | `/api/exam/[id]/submit` | ECDSA-verified encrypted submission |
| POST | `/api/keys/trustee-approve` | Independent trustee share submission |
| POST | `/api/keys/reconstruct` | Shamir 2-of-3 ceremony (quorum) |
| POST | `/api/exam/[id]/finalize` | Merkle tree finalization |
| POST | `/api/exam/[id]/evaluate` | MCQ grading + Ed25519 sign results |
| GET  | `/api/exam/[id]/results` | ECDH-re-encrypted result + Merkle proof |
| POST | `/api/audit` | Append signed audit chain entry |
| GET  | `/api/audit?verify=true` | Verify entire hash chain |

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture and component diagram |
| [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) | STRIDE analysis, trust boundaries, residual risks |
| [`docs/key-hierarchy.md`](docs/key-hierarchy.md) | 4-level key hierarchy explanation |
| [`docs/workflows.md`](docs/workflows.md) | Detailed examination workflow sequence diagrams |

---

## Architecture Decisions

**Why not use an HSM?** This is an academic prototype demonstrating software-only cryptography. HSM integration would obscure the cryptographic mechanisms we are evaluating. Shamir's SSS provides the multi-party authorization equivalent in software.

**Why ECDH above TLS?** Demonstrates PFS at the application layer. Acknowledged limitation: server Ed25519 key delivered over TLS — no protection against active TLS MITM. Documented as a research assumption.

**Why Ed25519 for audit + ECDSA for submissions?** Ed25519 (server-controlled, server-side) for chain signing. ECDSA-P256 (browser WebCrypto, non-exportable) for student submission binding — maximises WebCrypto compatibility.

**Trust model:** The server is semi-trusted. It participates in ECDH and grading.
A fully compromised server can read answers at grading time. See [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
for a full STRIDE analysis and honest documentation of limitations.

---

*KLE Technological University — CNS Project 2026 — Stage 7 Complete*
