# Architecture — Secure Online Examination System

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                          │
│  WebCrypto API: Ed25519 keygen, ECDSA-P256 keygen, AES-GCM      │
│  Non-exportable CryptoKeys — private keys never leave browser    │
│  ECDH ephemeral key pair generated per exam session              │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS / TLS 1.3
                        │ Application-layer ECDH session key on top
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS APP SERVER (Node.js v22)              │
│  Middleware: JWT verify (Edge) + RBAC + Rate limit               │
│  API Routes: auth, exam lifecycle, keys, audit                   │
│  In-process key stores (never DB):                               │
│    examKEKCache   Map<examId, Buffer>   (TTL: 1h)                │
│    sessionKeyStore Map<sessionId, Keys>  (TTL: 4h)               │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Prisma 5 ORM
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SQLite (dev) / PostgreSQL (prod)               │
│  All sensitive data stored ENCRYPTED — no plaintext keys in DB   │
│  WrappedDEK fields: AES-GCM(ExamKEK, DEK) for every asset       │
│  Shamir shares: AES-GCM(Argon2id(trustee_pass), share_bytes)    │
└─────────────────────────────────────────────────────────────────┘
```

## Exam Lifecycle Sequence

```
EXAM CREATION
  Examiner                Server                   DB
     │──── POST /exam/create ──────▶│               │
     │                              │ randomBytes(32) → ExamKEK
     │                              │ Shamir 2-of-3 → 3 EncryptedShares
     │                              │ RSA-OAEP(ExaminerPub, ExamKEK) → WrappedKEK
     │                              │──── store ExamKEKMetadata ──────▶│
     │◀─── examId + share urls ─────│                                  │

PAPER UPLOAD
     │──── POST /upload-paper ──────▶│                                  │
     │  (questions JSON)              │ for each question:               │
     │                              │   DEK = randomBytes(32)           │
     │                              │   AES-GCM(DEK, question) → CT     │
     │                              │   AES-GCM(ExamKEK, DEK) → wDEK   │
     │                              │   ZWC watermark embed             │
     │                              │──── store Question+CT+wDEK ──────▶│

STUDENT SESSION
  Student               Server                   DB
     │── ECDH handshake ──▶│                         │
     │  (clientEphPub)      │ serverEphKP = new ECDH()│
     │                      │ shared = ECDH(serverPriv, clientPub)
     │                      │ {K_enc, K_auth, K_iv} = HKDF(shared)
     │                      │ signed payload → Ed25519(serverPriv)
     │◀─ serverEphPub + sig ─│                         │
     │                      │ sessionKeyStore.set(sessionId, keys)
     │── GET /questions ───▶│                         │
     │                      │ ExamKEKCache.get(examId) → ExamKEK
     │                      │ AES-GCM-dec(ExamKEK, wDEK) → DEK
     │                      │ AES-GCM-dec(DEK, CT) → question
     │                      │ AES-GCM-enc(K_enc, question) → CT'
     │◀── encrypted questions ─│                       │

POST-EXAM CEREMONY
  Trustee1+2            Server                   DB
     │── POST /keys/reconstruct ─▶│                   │
     │  (trusteeId, password) ×2  │ Argon2id(pass) → shareKey
     │                             │ AES-GCM-dec(shareKey, encShare)
     │                             │ SSS.combine(2 shares) → ExamKEK
     │                             │ examKEKCache.set(examId, ExamKEK)
     │
     │── POST /reveal-commitment ─▶│ verify SHA-256(answers + salt) = commitment
     │── POST /finalize ──────────▶│ Merkle tree → root + inclusion proofs
     │── POST /evaluate ──────────▶│ grade MCQs → Ed25519-signed results
     │── PATCH /results ──────────▶│ releasedAt = now()
```

## Key Hierarchy Diagram

```
                    ┌─────────────────┐
                    │   ExamKEK [L1]  │  32 random bytes, per-exam
                    │  randomBytes(32) │
                    └────────┬────────┘
            ┌───────────────┼───────────────────────┐
            │               │                       │
     ┌──────▼──────┐  ┌─────▼──────┐       ┌───────▼──────┐
     │ Shamir Path │  │  RSA Path  │       │  Wraps DEKs  │
     │             │  │            │       │              │
     │ 2-of-3 SSS  │  │ RSA-OAEP   │       │ Per-question │
     │ Each share  │  │ (Examiner  │       │ Per-submission│
     │ Argon2id    │  │  RSA pub)  │       │ Per-result   │
     │ encrypted   │  │            │       │   [L2 DEKs]  │
     └─────────────┘  └────────────┘       └──────┬───────┘
                                                   │
                                         ┌─────────▼────────┐
                                         │    DEK [L2]      │
                                         │  randomBytes(32)  │
                                         │  per asset        │
                                         │  AES-256-GCM      │
                                         │  encrypts content │
                                         └──────────────────┘
     ┌───────────────────────┐
     │   Session Key [L3]    │  ephemeral, in-process only
     │  ECDH-P256 → HKDF     │
     │  K_enc[32] K_auth[32] │
     │  K_iv[16]  per session│
     └───────────────────────┘
```

## Threat Model

| Asset | Threat Actor | Protection | Limitation |
|-------|-------------|-----------|-----------|
| Exam questions | External attacker | AES-256-GCM + DEK hierarchy | — |
| Exam questions | DB compromise | Questions encrypted at rest; ExamKEK not in DB | ExamKEK in app RAM during delivery |
| ExamKEK | Single malicious admin | Shamir 2-of-3: 2 trustees required | 2 colluding trustees can reconstruct |
| ExamKEK | App server compromise | In RAM only during reconstruction; TTL 1h | Cannot prevent RAM read on full compromise |
| Submissions | Student impersonation | ECDSA-P256 signature (browser key) | Key loss = cannot re-sign |
| Results | Tampering by examiner | Ed25519 signature + Merkle tree | Examiner controls their own signing key |
| Audit log | Admin tampering | Hash chain + Ed25519 + external anchoring | Fully malicious admin can break before anchoring |
| Answer key | Pre-reveal leakage | SHA-256 commit-reveal | Commitment published before exam starts |
| Paper leaks | Recipient sharing | ZWC per-student watermark | Determined attacker can strip ZWC |

## Database Schema (17 tables)

```
User ─────────────── ExaminerKey (RSA pub)
  │                  LoginAttempt
  │                  RefreshToken
  │
  ├── Exam ─────────── Question (AES-GCM + WrappedDEK)
  │     │               AnswerKey (AES-GCM + commitment)
  │     │               ExamKEKMetadata (RSA-wrapped KEK)
  │     │               KeyShare (Shamir shares, Argon2id encrypted)
  │     │               ExamEnrollment
  │     │
  │     └── ExamSession ─── Submission ─── SubmissionDEK
  │                              │
  │                              └── Result ─── ResultDEK
  │
  ├── AuditLog (hash chain)
  └── UsedNonce (anti-replay)
```
