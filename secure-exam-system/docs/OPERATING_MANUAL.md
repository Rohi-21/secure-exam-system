# Complete Operational Manual & Demonstration Guide
## Secure Online Examination System Using Cryptography

**Institution:** KLE Technological University  
**Project:** Cryptography & Network Security (CNS) Capstone Platform  
**Repository:** `Rohi-21/secure-exam-system` (Branch: `main`)  
**Guide:** Miss Roopa Badami  
**Development Stack:** Next.js 16.4.6 · Node.js v22 · TypeScript · SQLite (Prisma ORM) · Tailwind CSS · WebCrypto API  

---

## Table of Contents

1. [Executive Summary & Security Architecture](#1-executive-summary--security-architecture)
2. [Prerequisites & System Startup](#2-prerequisites--system-startup)
3. [Identity & Credential Reference](#3-identity--credential-reference)
4. [Role-by-Role Operational Walkthrough](#4-role-by-role-operational-walkthrough)
   - [Phase 1: Student Self-Registration & Device Key Binding](#phase-1-student-self-registration--device-key-binding)
   - [Phase 2: Administrative Governance & Audit Monitoring](#phase-2-administrative-governance--audit-monitoring)
   - [Phase 3: Examiner Exam Creation & Cryptographic Preparation](#phase-3-examiner-exam-creation--cryptographic-preparation)
   - [Phase 4: Live Examination & Confidential Question Delivery](#phase-4-live-examination--confidential-question-delivery)
   - [Phase 5: Student Submission & Non-Repudiation](#phase-5-student-submission--non-repudiation)
   - [Phase 6: Shamir Reconstruction Ceremony & Commitment Reveal](#phase-6-shamir-reconstruction-ceremony--commitment-reveal)
   - [Phase 7: Automated Evaluation, Merkle Proofs & Results Release](#phase-7-automated-evaluation-merkle-proofs--results-release)
   - [Phase 8: Student Cryptographic Self-Verification](#phase-8-student-cryptographic-self-verification)
   - [Phase 9: Tamper-Evident Audit Hash Chain Verification](#phase-9-tamper-evident-audit-hash-chain-verification)
5. [Interactive Cryptographic Benchmarks](#5-interactive-cryptographic-benchmarks)
6. [Complete 10-Minute Viva / Presentation Script](#6-complete-10-minute-viva--presentation-script)
7. [System Verification & Troubleshooting Commands](#7-system-verification--troubleshooting-commands)

---

## 1. Executive Summary & Security Architecture

The **Secure Online Examination System** addresses the critical vulnerabilities of modern remote testing platforms: unauthorized question leaks, impersonation, man-in-the-middle tampering, post-exam answer key alteration, student repudiation, and unverified batch grading.

The platform provides a defense-in-depth cryptographic foundation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CRYPTOGRAPHIC DEFENSE MATRIX                      │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Security Requirement     │ Applied Cryptographic Mechanism             │
├──────────────────────────┼─────────────────────────────────────────────┤
│ User Authentication      │ Argon2id (memory-hard KDF) + TOTP (RFC 6238)│
│ Client Device Binding    │ WebCrypto Ed25519 Non-exportable Key Pairs  │
│ Application-Layer PFS    │ Ephemeral ECDH-P256 + HKDF Key Derivation   │
│ Question Confidentiality │ Shamir Secret Sharing (2-of-3) + AES-256-GCM│
│ Answer Key Non-Tamper    │ SHA-256 Commit-Reveal Scheme                │
│ Student Non-Repudiation  │ WebCrypto ECDSA-P256 Digital Signature      │
│ Submission Storage       │ AES-256-GCM Envelope Encryption (DEK / KEK) │
│ Batch Inclusion Proof    │ RFC 6962 Style Merkle Tree (SHA-256)        │
│ Forensics & Leak Tracing │ Steganographic Zero-Width Characters (ZWC)  │
│ Audit Trail Integrity    │ Tamper-Evident SHA-256 Hash Chain + Ed25519 │
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. Prerequisites & System Startup

### 2.1 Prerequisites
- **Node.js:** v18.0.0 or higher (v22.18.0 tested)
- **Package Manager:** npm v9+
- **Terminal:** PowerShell on Windows
- **Authenticator App:** Google Authenticator, Microsoft Authenticator, or 2FAS (optional — a built-in terminal generator is provided)

### 2.2 Booting the System from Scratch

Open PowerShell in the project directory:

```powershell
cd s:\CNS_project\secure-exam-system

# 1. Install dependencies (if not already installed)
npm install

# 2. Synchronize Prisma Database Schema
npx prisma db push

# 3. Seed Default Identities & Sample Exam Data
npm run seed

# 4. Start the Development Server
npm run dev
```

The application is immediately accessible at:
- **Local Application URL:** [http://localhost:3000](http://localhost:3000)
- **Login Portal:** [http://localhost:3000/login](http://localhost:3000/login)
- **Student Registration:** [http://localhost:3000/register](http://localhost:3000/register)
- **Admin Dashboard:** [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 3. Identity & Credential Reference

### 3.1 Pre-Seeded Default Accounts

All default accounts share the standard password: `DemoPassword@CNS2024!`

| Role | USN | Email | Assigned Purpose |
|---|---|---|---|
| **System Admin** | `ADMIN001` | `admin@kletech.ac.in` | Security posture, identity management, audit chain verification |
| **Lead Examiner** | `EX001` | `examiner@kletech.ac.in` | Exam creation, Shamir split, paper upload, grading & release |
| **Student 1** | `01FE23BCS240` | `rohidas@kletech.ac.in` | Exam taking, digital signing, results verification |
| **Student 2** | `01FE23BCS258` | `archana@kletech.ac.in` | Parallel examinee submission |
| **Student 3** | `01FE23BCS255` | `spoorthi@kletech.ac.in` | Parallel examinee submission |

### 3.2 Obtaining Live Authenticator Codes (TOTP RFC 6238)

The system enforces strict 30-second time-based one-time passwords for every login:

- **Quick Terminal Helper:** In a separate terminal window, run:
  ```powershell
  # For Admin
  npm run totp -- ADMIN001

  # For Examiner
  npm run totp -- EX001

  # For any registered student
  npm run totp -- 01fe23bar045

  # To view live codes for ALL registered accounts in a single table:
  npm run totp
  ```
- **Phone Authenticator:** The pre-seeded demo secret is `JBSWY3DPEHPK3PXP`. For newly registered accounts, scan the dynamic QR code displayed on screen.

---

## 4. Role-by-Role Operational Walkthrough

---

### Phase 1: Student Self-Registration & Device Key Binding

1. Open your browser and navigate to: [http://localhost:3000/register](http://localhost:3000/register)
2. Fill out the registration form:
   - **University Seat Number:** Enter your USN (e.g., `01FE23BCS099` — case insensitive)
   - **Full Name:** E.g., `Rohit Shenoy`
   - **Email:** E.g., `rohit@kletech.ac.in`
   - **Password:** Minimum 8 characters with upper, lower, digit, and special character (e.g., `Password123!@#`)
3. **Cryptographic Action Under the Hood:**
   - The browser invokes `crypto.subtle.generateKey` to generate two non-exportable hardware/browser-bound key pairs:
     - **Ed25519 Key Pair:** For session challenge-response device binding.
     - **ECDSA-P256 Key Pair:** For non-repudiation digital signatures on exam submissions.
   - The private keys are stored securely inside the browser's structured **IndexedDB** (`cns_exam_keystore`). Private keys never leave the client machine.
   - The public keys are sent to the server and permanently bound to your identity.
4. **TOTP Setup (Step 2):**
   - A dynamic QR code appears containing the user-specific TOTP URI.
   - Scan with Google Authenticator, or run:
     ```powershell
     npm run totp -- 01FE23BCS099
     ```
   - Enter the 6-digit code and click **Verify & Complete Registration**.
   - Your account is now provisioned with hardware-backed 3-factor authentication.

---

### Phase 2: Administrative Governance & Audit Monitoring

1. Navigate to: [http://localhost:3000/login](http://localhost:3000/login)
2. Enter the Admin credentials:
   - **USN:** `ADMIN001`
   - **Password:** `DemoPassword@CNS2024!`
   - **Authenticator Code:** Output from `npm run totp -- ADMIN001`
3. Click **Sign in**. The system validates Argon2id, verifies TOTP, verifies the single-use server nonce, and redirects to:
   - **Admin Dashboard:** [`/admin`](http://localhost:3000/admin)
4. **Key Administrative Actions:**
   - **System Overview & Security Posture:** Verify that Transport (TLS 1.3), Authentication (Argon2id + TOTP), Non-repudiation (ECDSA), and Batch Integrity (Merkle) indicators are active.
   - **User Management (`/users`):** Provision staff, examiners, and trustees. View identity counts, lockout statuses, and public key fingerprints.
   - **Audit Hash Chain (`/audit`):** Monitor all chronological institutional events in real-time.

---

### Phase 3: Examiner Exam Creation & Cryptographic Preparation

1. Open an Incognito/Private window (or log out) and go to: [http://localhost:3000/login](http://localhost:3000/login)
2. Sign in as Examiner:
   - **USN:** `EX001`
   - **Password:** `DemoPassword@CNS2024!`
   - **Authenticator Code:** Output from `npm run totp -- EX001`
3. You will be redirected to the **Examiner Exam Portal** at [`/exams`](http://localhost:3000/exams).
4. Click **Create New Exam** (`/exams/new`):
   - **Title:** `CNS Final Capstone Examination`
   - **Subject Code:** `21CS601`
   - **Duration:** `60` minutes
   - **Schedule Window:** Select start time and end time.
5. **The Shamir Secret Sharing Ceremony (2-of-3 Threshold):**
   - When creating the exam, the server generates a cryptographically random 256-bit **Exam Key Encryption Key (`ExamKEK`)**.
   - The `ExamKEK` is split into 3 mathematical shares using Shamir's polynomial interpolation scheme over GF($2^8$).
   - Each share is encrypted with **Argon2id** using individual trustee passphrases:
     - Trustee 1 (HOD): `HOD_Passphrase_2024!`
     - Trustee 2 (Chief Examiner): `Examiner_Passphrase_2024!`
     - Trustee 3 (Security Officer): `Auditor_Passphrase_2024!`
   - The raw `ExamKEK` is immediately purged from persistent storage. Only the encrypted shares remain in the database.
6. **Upload Question Paper (`/exams/[id]`):**
   - Input questions with MCQ options (A, B, C, D).
   - Each question is encrypted using **Envelope Encryption**: a fresh random 256-bit Data Encryption Key (`DEK`) encrypts the question text with AES-256-GCM, and the `DEK` is wrapped under the `ExamKEK`.
   - **Steganography Injection:** A forensic Zero-Width Character (`ZWC`) watermark encoding `examId:questionNo` is imperceptibly embedded into the question text.
7. **Answer Key Commitment Generation:**
   - The examiner inputs the correct answer key.
   - The system builds a canonical deterministic JSON string and computes:
     $$\text{Commitment} = \text{SHA-256}(\text{Canonical Answers} \mathbin{\Vert} \text{Random Salt})$$
   - The 64-character commitment hash is returned for external public posting (e.g., student noticeboard or GitHub Gist) **before** the exam starts. This guarantees the answer key cannot be tampered with after students write the exam.

---

### Phase 4: Live Examination & Confidential Question Delivery

1. In a regular browser window, log in as Student:
   - **USN:** `01FE23BCS240` (or your newly registered USN)
   - **Password:** `DemoPassword@CNS2024!` (or your chosen password)
   - **Authenticator Code:** Output from `npm run totp -- <USN>`
2. Land on the **Student Dashboard** (`/dashboard`). Active exams are listed.
3. Click **Take Examination** (`/exam/[id]`):
4. **The Ephemeral ECDH-P256 Handshake:**
   - The browser generates an ephemeral ECDH-P256 key pair.
   - The client sends its ephemeral public key to `/api/exam/[id]/ecdh-handshake`.
   - The server generates an ephemeral ECDH key pair, computes the shared DH secret, and derives distinct session keys using HKDF:
     - `K_enc`: Application-layer encryption key (AES-256-GCM)
     - `K_auth`: Session authentication key
     - `ivSeed`: 12-byte initialization seed
   - This provides **Perfect Forward Secrecy (PFS)** at the application layer, independent of TLS.
5. **Decryption & Watermarking:**
   - Questions are retrieved server-side, decrypted from storage, watermarked with student-specific ZWC markers, and re-encrypted with the student's `K_enc` session key before transmission.
   - The student's browser decrypts the questions locally. The exam interface displays an active timer and clean MCQ choices.

---

### Phase 5: Student Submission & Non-Repudiation

1. In the exam interface, select your answers for all questions.
2. Click **Submit Exam**.
3. **Cryptographic Pipeline during Submission:**
   - **Canonicalization:** Answers are sorted into deterministic JSON order:
     ```json
     {"answers":{"1":"A","2":"C","3":"B"}}
     ```
   - **Content Digest:** Client computes `contentHash = SHA-256(canonicalJson)`.
   - **Digital Signature:** The browser invokes WebCrypto to sign the `contentHash` using the student's non-exportable **ECDSA-P256 private key** stored in IndexedDB:
     $$\sigma = \text{ECDSA\_Sign}_{K_{\text{private}}}(\text{contentHash})$$
   - **Application-Layer Encryption:** Answers and metadata are encrypted under `K_enc`.
   - **Anti-Replay Nonce:** A single-use `submissionNonce` is attached and recorded in the database.
   - **Server Storage:** Upon receiving, the server verifies the ECDSA signature against the student's registered public key, envelope-encrypts the submission under a fresh `SubmissionDEK`, and records the submission in the tamper-evident audit log.

---

### Phase 6: Shamir Reconstruction Ceremony & Commitment Reveal

Once the exam window closes:

1. Log in as Examiner (`EX001`) or Admin (`ADMIN001`).
2. Navigate to the Exam Management view: [`/exams/[id]`](http://localhost:3000/exams).
3. **Step A: Shamir Reconstruction Ceremony:**
   - To decrypt submissions and grade them, the `ExamKEK` must be reconstructed in volatile memory.
   - Threshold is 2-of-3. Two trustees enter their passphrases:
     - **Trustee 1:** `HOD_Passphrase_2024!`
     - **Trustee 2:** `Examiner_Passphrase_2024!`
   - The server decrypts both shares using Argon2id-derived keys, performs Lagrange polynomial interpolation, and restores the 256-bit `ExamKEK` into volatile RAM with an automated TTL.
4. **Step B: Answer Key Commitment Reveal:**
   - The examiner reveals the plaintext answer key and original random salt:
     `POST /api/exam/[id]/reveal-commitment`
   - The server verifies that:
     $$\text{SHA-256}(\text{Canonical Answers} \mathbin{\Vert} \text{Salt}) \stackrel{?}{=} \text{Stored Commitment}$$
   - When verified, the salt is committed to the database and marked **`VALID ✓`**. Anyone can now mathematically verify the answer key was fixed before the exam started.

---

### Phase 7: Automated Evaluation, Merkle Proofs & Results Release

1. **Trigger Automated Evaluation:**
   - Click **Run Auto-Evaluation** (`POST /api/exam/[id]/evaluate`).
   - The server decrypts submissions under `ExamKEK`, grades answers against the canonical answer key, and computes scores.
   - Each student's result is encrypted with a new `ResultDEK` wrapped under `ExamKEK`.
   - The examiner's authority signature (Ed25519) is computed over the result ciphertext digest.
2. **Batch Merkle Tree Construction:**
   - All student submission digests $H_1, H_2, \dots, H_n$ become leaf nodes in an RFC 6962-compliant Merkle Tree.
   - The server calculates the **Merkle Root**:
     $$\text{Root} = \text{MerkleNode}(H_{1,2}, H_{3,4})$$
   - For every student, the server extracts their unique **Merkle Inclusion Proof** (path of sibling hashes from leaf to root) and stores it with their submission.
3. **Release Results:**
   - Click **Release Results** (`PATCH /api/exam/[id]/results`).
   - Results become accessible to students.

---

### Phase 8: Student Cryptographic Self-Verification

1. Log in as Student (`01FE23BCS240`).
2. Navigate to: [http://localhost:3000/results](http://localhost:3000/results) and open your exam result.
3. **The Result Screen Displays:**
   - **Score & Breakdown:** Total questions, correct/incorrect count, percentage.
   - **Submission Content Hash:** SHA-256 digest of your exact submitted answers.
   - **Examiner Digital Signature:** Verified with green checkmark (`Valid ✓`).
   - **Interactive Merkle Tree Verifier:**
     - Displays your leaf hash and the batch Merkle Root.
     - Displays the cryptographic sibling proofs (`left` / `right` pairs).
     - Allows student to click **Verify Merkle Proof Independently** — the browser executes client-side SHA-256 hashing up the proof tree and validates matching of the batch root!

---

### Phase 9: Tamper-Evident Audit Hash Chain Verification

1. Log in as Admin (`ADMIN001`) and visit: [http://localhost:3000/audit](http://localhost:3000/audit)
2. **Chain Structure:**
   - Entry #1 is the Genesis block: `prevHash = 0000000000000000000000000000000000000000000000000000000000000000`.
   - Every subsequent entry computes:
     $$\text{entryHash} = \text{SHA-256}(\text{prevHash} \mathbin{\Vert} \text{timestamp} \mathbin{\Vert} \text{eventType} \mathbin{\Vert} \text{payloadJSON})$$
   - Every block is digitally signed with the institutional **Ed25519 server private key**.
3. **Verification Button:**
   - Click **Verify Full Audit Chain Integrity**.
   - The system checks sequential hash continuity and Ed25519 signatures across all entries.
   - Returns: **`Chain Verified: 0 Breaks Detected`**.

---

## 5. Interactive Cryptographic Benchmarks

The platform includes a live benchmarking suite demonstrating why these cryptographic primitives were selected:

1. Navigate to: [http://localhost:3000/benchmarks](http://localhost:3000/benchmarks)
2. **Benchmark 1: Symmetric Encryption (AES-256-GCM vs AES-CBC)**
   - Click **Run Benchmark**.
   - Demonstrates AES-256-GCM throughput and hardware acceleration, while highlighting why GCM's built-in 128-bit authentication tag eliminates ciphertext-tampering attacks present in unauthenticated CBC mode.
3. **Benchmark 2: Password Hashing (Argon2id vs PBKDF2)**
   - Click **Run Benchmark**.
   - Demonstrates Argon2id's memory-hardness (64 MB RAM per hash) that renders GPU and ASIC brute-force attacks mathematically infeasible compared to traditional PBKDF2.

---

## 6. Complete 10-Minute Viva / Presentation Script

Use this exact structure when demonstrating the project to evaluators:

| Minute | Stage | Action / Screen | Key Talking Point for Evaluators |
|---|---|---|---|
| **0:00 - 1:30** | Introduction & Architecture | Show Slides / System Overview on `/admin` | "Most exam platforms rely solely on HTTPS. If the server is breached, everything leaks. We implemented true end-to-end defense-in-depth: zero-trust storage, client non-repudiation, and multi-party key ceremonies." |
| **1:30 - 3:00** | Student Onboarding & 3FA | `/register` & Google Authenticator | "During registration, the browser uses WebCrypto to create non-exportable Ed25519 and ECDSA keys inside IndexedDB. We combine Argon2id + TOTP RFC 6238 + hardware device binding." |
| **3:00 - 4:30** | Exam Setup & Shamir Ceremony | `/exams/new` & `/exams/[id]` | "No single administrator holds the exam decryption key. We split the 256-bit ExamKEK using Shamir (2-of-3 threshold) with Argon2id-encrypted shares. The answer key is committed via SHA-256 commit-reveal before exams open." |
| **4:30 - 6:30** | Live Exam & ECDH Handshake | `/exam/[id]` (Student view) | "Students negotiate an ephemeral ECDH-P256 key pair giving Perfect Forward Secrecy. Questions are watermarked with imperceptible Zero-Width Characters. Submissions are digitally signed with the student's ECDSA private key." |
| **6:30 - 8:00** | Key Reconstruction & Grading | `/exams/[id]` & `/api/exam/[id]/evaluate` | "Two trustees submit passphrases to reconstruct the ExamKEK via Lagrange interpolation. The answer key commitment is revealed and verified. Auto-evaluation runs, and results are finalized into an RFC 6962 Merkle Tree." |
| **8:00 - 9:00** | Merkle Proof Verification | `/results/[id]` (Student view) | "Students receive an interactive Merkle inclusion proof. The student's browser hashes up the tree to verify their paper was included in the certified grading batch without revealing other students' scores." |
| **9:00 - 10:00** | Audit Chain & Conclusion | `/audit` & `/benchmarks` | "All lifecycle events form a SHA-256 hash chain signed with Ed25519. We click 'Verify Chain' to prove zero tampering from genesis to head." |

---

## 7. System Verification & Troubleshooting Commands

### 7.1 Running the Automated Test Suite

Verify that all 62 cryptographic assertions pass:

```powershell
npm test
```
*Expected Output:*
```text
# tests 62
# suites 8
# pass 62
# fail 0
```

### 7.2 Running TypeScript Verification

Ensure zero compilation or type discrepancies:

```powershell
npm run typecheck
```
*Expected Output:*
```text
> npx tsc --noEmit
# Exits with code 0 (Zero errors)
```

### 7.3 Unlocking Accounts & Resetting Counters

If an account was locked due to excessive failed password attempts:

```powershell
npx tsx scripts/reset-lockout.ts
```
*Expected Output:* `✅ All user accounts unlocked and failed attempt counters reset to 0.`

### 7.4 Resetting & Re-Seeding the Entire Database

To return the entire database to a pristine demo state:

```powershell
npx prisma db push --force-reset
npm run seed
```

---

*Operational manual complete and validated for the KLE Technological University Capstone Evaluation.*
