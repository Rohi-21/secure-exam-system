# Threat Model — Secure Online Examination System

**Project:** Secure Online Examination System Using Cryptography  
**Institution:** KLE Technological University, Hubballi  
**Course:** Cryptography and Network Security (CNS)  
**Guide:** Miss Roopa Badami  
**Date:** November 2026  

---

## 1. System Purpose and Scope

This system is an academic prototype that demonstrates the application of modern
cryptographic protocols in a proctored online examination setting. The threat
model is provided to honestly document which attacks the system resists, which
it detects, and which are explicitly out of scope.

---

## 2. Assets

| Asset | Sensitivity | Storage |
|---|---|---|
| Exam question paper | High — must remain secret until exam window | Encrypted at rest under ExamKEK |
| Answer key | High — must not be known to graders before submission | Commit-reveal; sealed under ExamKEK |
| Student submissions | High — integrity must be verifiable | Signed by student ECDSA key; AES-GCM encrypted in DB |
| ExamKEK (Exam Key Encryption Key) | Critical | Split into 3 Shamir shares; never stored whole |
| Server Ed25519 signing key | Critical | In `.env.local`; never transmitted |
| Student ECDSA signing keys | High | Non-exportable in browser IndexedDB; private key never leaves browser |
| Audit log chain | High — tampering must be detectable | Signed hash chain in database |
| Session keys (K_enc, K_auth) | Medium — ephemeral | Derived via ECDH+HKDF; purged after session |
| TOTP secrets | High — enables 2FA | AES-256-GCM encrypted at rest |
| Argon2id password hashes | Medium | Database; never plaintext |

---

## 3. Trust Boundaries

```
 Browser (Student/Examiner)             Server Process            Database
 ──────────────────────────            ──────────────            ────────
  Non-exportable CryptoKeys             Trusted for key           Trusted for
  IndexedDB keystore                    derivation, grading,      data persistence
  Client-side ECDSA signing             signature creation        only
  Local draft AES-GCM encryption        
                                        ← HTTPS TLS boundary →
  Session keys shared via ECDH ─────────────────────────────────
  Submission encrypted under K_enc ─────────────────────────────
```

**Key trust assumption:** The server is semi-trusted. It participates in ECDH
key agreement and in automated grading. It is NOT treated as fully adversarial.
If the server is fully compromised, it can read decrypted submissions at the
point of grading. This is a fundamental limitation of server-side auto-grading
and is honestly documented.

---

## 4. Actors

| Actor | Role | Trust Level |
|---|---|---|
| Student | Takes exam via browser | Untrusted input; authenticated |
| Examiner | Creates exams, publishes answer keys | Trusted for exam content |
| HOD / Admin | Provisions accounts, manages users | Highly trusted |
| Trustee (1–3) | Holds one Shamir secret share | Individually untrusted; quorum trusted |
| Attacker (network) | Passive / active MITM | Fully adversarial |
| Attacker (browser) | Injected scripts, XSS | Mitigated by HttpOnly cookies, CSP |
| Malicious student | Attempts answer tampering, replay | Mitigated by signing + nonce |
| Malicious examiner | Backdating, biased grading | Mitigated by commit-reveal + audit log |
| Rogue server admin | DB access, log tampering | Partially mitigated by external audit anchoring |

---

## 5. STRIDE Analysis

### 5.1 Spoofing

| Threat | Control |
|---|---|
| Student impersonates another | JWT + Argon2id login + TOTP 2FA + Ed25519 device challenge |
| Server impersonated (MITM) | HTTPS TLS + Ed25519-signed ECDH handshake transcript verified in browser |
| Trustee impersonates another | Each trustee independently authenticates with their own passphrase |

### 5.2 Tampering

| Threat | Control |
|---|---|
| Submission answer tampering | Student ECDSA-P256 signature over canonical RFC 8785 JSON + SHA-256 digest |
| Exam question tampering | AES-256-GCM authenticated encryption with AAD binding examId |
| Audit log tampering | SHA-256 hash chain + Ed25519 signatures; verified on demand |
| Result tampering | Merkle tree inclusion proof; Ed25519-signed by server evaluation key |
| Replay of old submission | Submission nonce (UUID4); single-use enforced server-side |
| Session substitution | `x-auth-session-id` and `x-exam-session-id` are independent headers; JWT claims non-overrideable |

### 5.3 Repudiation

| Threat | Control |
|---|---|
| Student denies submitting | ECDSA signature over canonical payload bound to studentId + examId + nonce |
| Examiner denies publishing commitment | Commitment hash + salt stored and timestamped in audit log |
| Server denies result | Ed25519-signed result envelope; Merkle inclusion proof retained |

**Limitation:** The student's ECDSA private key lives in browser IndexedDB.
Key theft from a compromised device cannot be excluded. This is documented as
an acknowledged limitation, not a claimed security guarantee.

### 5.4 Information Disclosure

| Threat | Control |
|---|---|
| Questions leaked before exam | Questions stored encrypted under ExamKEK; ExamKEK never reconstructed until quorum approves |
| Answer key known before grading | Commit-reveal: SHA-256(salt ‖ answers) published before exam; salt+answers revealed post-exam only |
| Submissions read in transit | HTTPS TLS + application-layer AES-256-GCM envelope under ECDH session key |
| Session key extracted from memory | Ephemeral ECDH private keys discarded after derivation; session keys have TTL in `sessionStore` |
| TOTP secret leaked from DB | Stored AES-256-GCM encrypted under server TOTP key |

### 5.5 Denial of Service

| Threat | Control |
|---|---|
| Brute-force login | Account lockout after 5 failed attempts (Argon2id slows attack) |
| Replay of ECDH handshake | Handshake nonce + 15-minute timestamp window; server session deduplication |
| Resubmission flood | Duplicate nonce rejection; 409 Conflict on second submission |

**Out of scope:** Volumetric network DoS, server resource exhaustion. This is a
prototype, not a production deployment.

### 5.6 Elevation of Privilege

| Threat | Control |
|---|---|
| Student self-assigns examiner role | Role provisioning restricted to `/api/admin/users` (admin/hod only); proxy RBAC enforces |
| Public registration with privileged role | `/api/auth/register` accepts only `student` role; other roles require admin POST |
| JWT role claim forgery | JWT signed with `JWT_SECRET` (HMAC-SHA256); verified on every request by middleware |

---

## 6. What This System Does NOT Provide

The following properties are **not** claimed:

1. **True end-to-end encryption to the examiner.** The server decrypts submissions
   during automated grading. A fully malicious server admin can read answers.

2. **Tamper-proof audit log.** The hash chain detects tampering but does not prevent
   it if the attacker controls the database. External anchoring (GitHub Gist publication)
   is the designed mitigation; it is not automated in this prototype.

3. **Unconditional non-repudiation.** The student's private key lives in a browser
   that may be shared or compromised.

4. **Protection against a compromised browser.** XSS or malware with IndexedDB access
   can steal signing keys.

5. **Perfect secrecy of exam questions against a quorum of colluding trustees.**
   If 2 of 3 trustees cooperate, they can reconstruct the ExamKEK before the
   authorized window.

---

## 7. Cryptographic Primitive Justification

| Primitive | Standard | Justification |
|---|---|---|
| AES-256-GCM | NIST SP 800-38D | Authenticated encryption; 256-bit key; 96-bit IV; auth tag |
| ECDH P-256 | NIST SP 800-56A | Ephemeral key agreement; PFS per session |
| HKDF-SHA256 | RFC 5869 | Key derivation from shared secret; domain separation |
| Ed25519 | RFC 8032 | Fast, secure digital signatures; server identity & audit |
| ECDSA P-256 | FIPS 186-4 | Student submission signing from browser WebCrypto |
| SHA-256 | FIPS 180-4 | Hash chain, content hashes, commitment |
| Argon2id | RFC 9106 | Memory-hard password hashing; preferred over bcrypt |
| TOTP | RFC 6238 | 2FA; ±1 window; anti-replay via consumed time-step set |
| Shamir SSS | Shamir 1979 | 2-of-3 threshold secret sharing for ExamKEK |
| Merkle Tree | Merkle 1980 | Result set integrity; individual inclusion proofs |

---

## 8. Residual Risks

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Server key compromise | Low | Critical | Key rotation procedure; separate audit key |
| Trustee collusion (2-of-3) | Very low | Critical | Organizational trust; audit log of approvals |
| Browser key theft (XSS) | Medium | High | CSP headers; non-exportable CryptoKey (extractable=false) |
| Clock skew TOTP bypass | Low | Medium | ±1 window (60s); anti-replay set |
| DB backup exposure | Low | High | All sensitive fields encrypted at rest |

---

*This threat model was produced as part of an academic CNS project and reflects
a research-grade prototype. Production deployment would require additional controls
including HSM key storage, formal penetration testing, and compliance review.*
