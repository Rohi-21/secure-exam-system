# Secure Online Examination System Using Cryptography

**Project Technical Report & Cryptographic Evaluation**  
**Department of Computer Science & Engineering**  
**KLE Technological University, Hubballi, Karnataka, India**  

- **Subject:** Cryptography and Network Security (CNS)
- **Course Guide:** Miss Roopa Badami
- **Academic Year:** 2024–2025

### Team Members & Contributions

| Name | Roll No | USN | Core Architectural Contribution |
|---|---|---|---|
| **K Rohidas Shenoy** | 107 | 01FE23BCS240 | Backend Architecture, Cryptographic Engine (AES-GCM, RSA, ECDH, KDF), Edge Auth & Middleware |
| **Archana K** | 152 | 01FE23BCS258 | Frontend Engineering, WebCrypto Client Key Management, Student Exam Experience & Results UI |
| **Spoorthi L C** | 162 | 01FE23BCS255 | Relational & Encrypted Schema Design, Shamir Secret Sharing, Tamper-Evident Hash Chain Audit |
| **Sanathkumar B B** | 109 | 01FE23BCS042 | ECDSA Client Signing, Zero-Width Steganography, Empirical Benchmarks & End-to-End Test Suite |

---

## 1. Executive Summary

Online examination systems in higher education frequently suffer from structural security vulnerabilities, including unauthorized question paper leakage, pre-exam answer tampering, untracked grade manipulation, and database administrator privilege abuse. Conventional web applications attempt to mitigate these threats using simple transport encryption (TLS) and perimeter database credentials. However, this approach leaves all data vulnerable to privileged database administrators, compromised server processes, and insider threats.

This project delivers a **research-grade secure online examination architecture** implementing software-based cryptographic controls across the entire examination lifecycle. The system enforces strict cryptographic separation of privileges without relying on specialized hardware security modules (HSMs).

Key achievements include:
- **4-Level Key Hierarchy:** Strict envelope encryption with per-asset DEKs and per-exam ExamKEKs.
- **Distributed Key Custody:** Shamir's 2-of-3 Secret Sharing requiring multi-trustee consensus to reconstruct decryption keys.
- **Application-Layer PFS:** Ephemeral ECDH-P256 key exchange combined with HKDF-SHA256, protecting examination content even against passive TLS proxy inspection.
- **Pre-Exam Answer Integrity:** Cryptographic commitment scheme ($\text{SHA-256}(\text{CanonicalAnswers} \mathbin{\Vert} \text{Salt})$) published prior to examination start.
- **Non-repudiable Submissions:** Browser-side ECDSA-P256 signatures over submission content hashes.
- **Batch Tamper Detection:** Domain-separated Merkle trees providing cryptographically verifiable inclusion proofs for student submissions.
- **Auditing with External Anchoring:** Sequential SHA-256 hash-chain audit log with Ed25519 digital signatures and external head publishing to GitHub Gist.
- **Forensic Leak Tracing:** Invisible Unicode zero-width character (ZWC) steganographic watermarking embedded per student.

---

## 2. Threat Model & Trust Boundaries

### 2.1 Protected Assets
1. **Unreleased Question Papers:** Confidentiality and integrity prior to and during the examination window.
2. **Official Answer Keys:** Pre-exam immutability and secrecy until official post-exam reveal.
3. **Student Examination Submissions:** Authenticity, non-repudiation, and immutability against post-submission modification.
4. **Graded Results:** Authenticity and verifiable proof of evaluation without examiner tampering.
5. **System Audit Logs:** Verifiable chronological sequencing and detection of retrospective log alteration.

### 2.2 Threat Actors & Adversarial Capabilities
- **Curious/Malicious Students:** Network traffic interception, submission tampering, unauthorized early paper access, examination paper re-distribution/leaking.
- **Rogue / Corrupted Examiner:** Retrospective modification of answer keys after observing student performance; arbitrary grade tampering.
- **Privileged Database Administrator (DBA):** Full read/write access to the relational database tables, SQL injection, offline database dump analysis.
- **Compromised TLS Proxy / Reverse Proxy:** Passive packet sniffing or TLS termination at reverse proxies/load balancers.

### 2.3 Explicit Security Guarantees & Assumptions
| Asset / Mechanism | Security Guarantee Provided | Critical Underlying Assumptions |
|---|---|---|
| **Question Papers at Rest** | Confidential even if full database dump is stolen | ExamKEK is not present in DB; trustees do not collude |
| **ExamKEK Custody** | No single administrator can decrypt exam papers | At most 1 trustee is compromised (2-of-3 threshold) |
| **Answer Key Integrity** | Examiner cannot change answer key after exam opens | Canonical answer hash published to immutable external log |
| **Student Submissions** | Student cannot deny submitting; server cannot forge answer | Student private key never leaves browser WebCrypto |
| **Session Delivery** | Passive network eavesdroppers cannot read papers | Ephemeral ECDH keys discarded immediately after session |
| **Audit Log Integrity** | Any deleted or altered log entry is mathematically detectable | Verification key is trusted; past hash anchored externally |

---

## 3. Cryptographic Specification & Standards

```
+----------------------------------------------------------------------------------------------------+
|                                    CRYPTOGRAPHIC PRIMITIVES                                        |
+--------------------------+-----------------------+-------------------------------------------------+
| Primitive                | Standard              | Operational Role                                |
+--------------------------+-----------------------+-------------------------------------------------+
| AES-256-GCM              | NIST SP 800-38D       | Authenticated encryption for all data at rest   |
| RSA-2048 (OAEP-SHA256)   | RFC 8017 (PKCS#1 v2.2)| Backup wrapping of ExamKEK for examiner         |
| ECDH-P256                | NIST SP 800-56A       | Ephemeral session key negotiation               |
| HKDF-SHA256              | RFC 5869              | Cryptographic expansion of shared secrets       |
| Argon2id                 | RFC 9106              | Password hashing & trustee share key derivation |
| ECDSA-P256               | FIPS 186-4            | Student submission non-repudiation              |
| Ed25519 (EdDSA)          | RFC 8032              | Server identity, session binding & audit signing|
| SHA-256                  | FIPS 180-4            | Hash chain, commitment scheme & Merkle trees    |
| Shamir Secret Sharing    | Shamir (1979)         | (t=2, n=3) distributed key management           |
| TOTP (SHA-1, 30s)        | RFC 6238              | Time-based two-factor authentication            |
+--------------------------+-----------------------+-------------------------------------------------+
```

---

## 4. Architectural Highlights & Deep Dives

### 4.1 Four-Tier Key Hierarchy
```
L1: ExamKEK (32 bytes)
    ├── Shamir 2-of-3 Split -> 3x AES-256-GCM(Argon2id(password_i), Share_i)
    └── RSA-OAEP-SHA256(ExaminerPublicKey, ExamKEK) [Backup Path]
        │
        ├── Wraps L2: Question DEKs (AES-256-GCM)
        ├── Wraps L2: Answer Key DEK (AES-256-GCM)
        ├── Wraps L2: Submission DEKs (AES-256-GCM)
        └── Wraps L2: Result DEKs (AES-256-GCM)

L3: Session Keys (ECDH-P256 + HKDF)
    ├── K_enc (32 bytes AES-256-GCM)
    ├── K_auth (32 bytes HMAC)
    └── K_iv_seed (16 bytes IV seed)

L4: Browser Local Draft Key (Non-exportable WebCrypto AES-GCM)
```

### 4.2 Ephemeral ECDH & Perfect Forward Secrecy (PFS)
To isolate student sessions from transport-layer vulnerabilities, the system performs an application-layer Diffie-Hellman exchange above TLS:
1. Client generates $(sk_c, pk_c) \leftarrow \text{ECDH-P256}$.
2. Server generates $(sk_s, pk_s) \leftarrow \text{ECDH-P256}$.
3. Shared Secret $Z = \text{ECDH}(sk_s, pk_c) = \text{ECDH}(sk_c, pk_s)$.
4. Server authenticates handshake by signing $(pk_s \mathbin{\Vert} pk_c \mathbin{\Vert} \text{examId} \mathbin{\Vert} \text{sessionId} \mathbin{\Vert} \text{nonce})$ using long-term Ed25519 key.
5. Even if the server's long-term key is later compromised, past session traffic cannot be decrypted because ephemeral private keys $sk_s, sk_c$ are never retained.

### 4.3 Answer Key Commitment Scheme
To eliminate the risk of an examiner altering the answer key post-facto:
$$\text{CanonicalAnswers} = \text{JSON.stringify}(\text{sortKeys}(\text{Answers}))$$
$$\text{Commitment} = \text{SHA-256}(\text{CanonicalAnswers} \mathbin{\Vert} \text{Salt})$$
- The Commitment is published to the public examination record before the examination begins.
- The Salt is held secret until the examination window closes.
- After closure, the examiner submits the Salt, allowing any student or third-party auditor to verify that the answers graded match the pre-exam commitment.

### 4.4 Merkle Tree Batch Submission Integrity
Student submission content hashes form the leaves of a binary Merkle tree:
- Leaf hash: $H_{leaf} = \text{SHA-256}(\text{"leaf:"} \mathbin{\Vert} \text{ContentHash})$
- Internal node: $H_{node} = \text{SHA-256}(\text{"node:"} \mathbin{\Vert} \text{LeftChild} \mathbin{\Vert} \text{RightChild})$
- Domain separation prefix (`"leaf:"` vs `"node:"`) mathematically prevents second-preimage attacks.
- Each student receives an inclusion proof consisting of sibling hashes $(h_1, h_2, \dots, h_d)$, allowing $O(\log N)$ cryptographic verification that their submission was included in the evaluated batch.

### 4.5 Steganographic Watermarking
Question texts delivered to each student contain an imperceptible watermark encoded using Unicode Zero-Width Characters:
- `\u200B` (Zero-Width Space) represents binary `0`
- `\u200C` (Zero-Width Non-Joiner) represents binary `1`
- `\u200D` (Zero-Width Joiner) acts as a field delimiter
- The watermark encodes $\text{HMAC}(\text{WatermarkKey}, \text{ExamID} \mathbin{\Vert} \text{StudentID} \mathbin{\Vert} \text{QuestionNo})$.
- If a student captures screenshots or copies question text to an external forum, the invisible character sequence persists and pinpoints the leaking student.

---

## 5. Empirical Performance & Benchmarks

All benchmarks were executed on an AMD Ryzen / Intel Core environment running Node.js v22 on Windows 11 with 500 iterations per payload size.

### 5.1 Cipher Benchmark (Throughput & Latency)
| Payload Size | AES-256-GCM (Our Choice) | AES-256-CBC + HMAC | AES-256-CTR (No Auth) | GCM vs CBC Speedup |
|---|---|---|---|---|
| **1 KB** | 98.1 MB/s (10.0 µs) | 77.0 MB/s (12.7 µs) | 228.9 MB/s (4.3 µs) | **1.27x** |
| **16 KB** | 667.2 MB/s (23.4 µs) | 374.9 MB/s (41.7 µs) | 663.6 MB/s (23.5 µs) | **1.78x** |
| **64 KB** | 780.4 MB/s (80.1 µs) | 413.3 MB/s (151.2 µs) | 889.2 MB/s (70.3 µs) | **1.89x** |
| **1 MB** | **950.6 MB/s** (1051.9 µs) | 459.9 MB/s (2174.2 µs) | 1023.9 MB/s (976.6 µs) | **2.07x** |

**Conclusion:** AES-256-GCM provides integrated authenticated encryption (AEAD) in a single pass using GHASH acceleration, outperforming legacy Encrypt-then-MAC (AES-CBC + HMAC) by over **2x** on large payloads while eliminating padding oracle vulnerabilities.

### 5.2 Key Derivation Function (KDF) Benchmark
| Algorithm | Avg Time (ms) | Throughput (ops/s) | Memory Footprint | NIST / RFC Compliance |
|---|---|---|---|---|
| **Argon2id** (m=64MB, t=3, p=4) | **280.6 ms** | **3.56 ops/s** | **64 MB** | **RFC 9106 Compliant (Our Choice)** |
| PBKDF2-SHA256 (100K iter) | 28.0 ms | 35.76 ops/s | ~0 MB (CPU only) | Below NIST min (600K) |
| PBKDF2-SHA256 (600K iter) | 173.2 ms | 5.77 ops/s | ~0 MB (CPU only) | NIST SP 800-132 Compliant |
| bcrypt (cost 10) | 60.0 ms | 16.65 ops/s | 4 KB (Fixed) | Legacy standard |
| bcrypt (cost 12) | 223.6 ms | 4.47 ops/s | 4 KB (Fixed) | Acceptable legacy |

**Conclusion:** Argon2id is strictly superior because of its memory-hardness. An attacker utilizing specialized GPU or ASIC cracking clusters is memory-constrained by 64 MB per guess, making parallel brute-force attacks computationally and economically infeasible.

---

## 6. Verification & Automated Test Suites

The codebase is backed by **56 automated test assertions across 7 test suites**, with a 100% pass rate:

```
TAP version 13
# Suite 1: Commit-Reveal Scheme (8/8 tests pass)
# Suite 2: Merkle Tree Correctness & Proofs (8/8 tests pass)
# Suite 3: Shamir 2-of-3 Secret Sharing (8/8 tests pass)
# Suite 4: Audit Chain Hash Integrity & Tamper Detection (8/8 tests pass)
# Suite 5: Ephemeral ECDH Perfect Forward Secrecy (6/6 tests pass)
# Suite 6: Unicode Zero-Width Steganography (8/8 tests pass)
# Suite 7: Full End-to-End Examination Lifecycle (10/10 tests pass)

TOTAL: 56 tests passed, 0 failed, 0 skipped.
Production Build: Next.js Turbopack, 21 routes compiled cleanly with 0 TypeScript errors.
```

---

## 7. Conclusion & Research Significance

This project demonstrates that robust, defense-in-depth security for online examination platforms does not require proprietary hardware or opaque commercial appliances. By composing standard cryptographic primitives—envelope encryption, multi-party threshold secret sharing, ephemeral key agreement, commitment schemes, Merkle trees, and cryptographic audit chaining—the system establishes provable trust boundaries and comprehensive operational integrity.

The software is ready for academic evaluation, research demonstration, and production deployment.
