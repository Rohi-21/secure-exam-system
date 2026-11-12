# End-to-End Cryptographic Workflows & Sequence Specifications

**Secure Online Examination System Using Cryptography**  
Department of Computer Science & Engineering, KLE Technological University  

---

## Workflow 1: Registration & Hardware/Browser Device Key Provisioning

```mermaid
sequenceDiagram
    autonumber
    actor User as Student / Examiner
    participant Browser as Web Browser (WebCrypto)
    participant Server as Application Server
    participant DB as Database (Prisma)

    User->>Browser: Enters Registration Details (USN, Email, Password)
    Browser->>Browser: Generate Ed25519 Key Pair (Device Authentication)
    Browser->>Browser: Generate ECDSA-P256 Key Pair (Submission Non-repudiation)
    Browser->>Browser: Store Private Keys in IndexedDB / WebCrypto (non-exportable)
    Browser->>Server: POST /api/auth/register (Credentials + Public Keys)
    Server->>Server: Argon2id Hash (Password, m=64MB, t=3, p=4)
    Server->>Server: Generate TOTP Secret (RFC 6238)
    Server->>Server: Encrypt TOTP Secret under Server Master Key
    Server->>DB: Store User Record with Public Keys & Encrypted TOTP
    Server-->>Browser: Return TOTP Setup URI (QR Code)
    User->>Browser: Scans QR code with Authenticator app
    Browser->>Server: POST /api/auth/register/verify-totp (TOTP code)
    Server->>Server: Validate TOTP (+-1 window)
    Server-->>Browser: Registration Confirmed
```

---

## Workflow 2: Two-Step Authentication with Ed25519 Challenge-Response

```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant Browser as Client Browser
    participant Server as Application Server
    participant SessionMap as In-Process Memory

    User->>Browser: Submits USN, Password, TOTP Token
    Browser->>Server: POST /api/auth/login
    Server->>Server: Verify Argon2id Password Hash
    Server->>Server: Verify TOTP Token
    Server->>Server: Generate 256-bit Challenge Nonce
    Server->>SessionMap: Store pendingChallenges.set(nonce, {userId, expires: 60s})
    Server-->>Browser: Return { challengeNonce }
    Browser->>Browser: Sign challengeNonce using stored Ed25519 Private Key
    Browser->>Server: POST /api/auth/login/challenge { nonce, signature }
    Server->>SessionMap: Retrieve pending challenge & verify expiry
    Server->>Server: Verify Ed25519 signature against registered User.ed25519PubKey
    Server->>Server: Mint 15-min JWT Access Token + 7-day Refresh Token
    Server-->>Browser: Set httpOnly Refresh Cookie + Return Access Token in RAM
```

---

## Workflow 3: Exam Paper Upload & Shamir Secret Sharing Ceremony

```mermaid
sequenceDiagram
    autonumber
    actor Examiner as Examiner
    participant Server as Application Server
    participant SSS as Shamir Engine
    participant DB as Database

    Examiner->>Server: POST /api/exam/create (Title, Window, Trustees)
    Server->>Server: Generate random ExamKEK (32 bytes)
    Server->>SSS: Split ExamKEK into (t=2, n=3) Shamir Shares
    loop For each Trustee
        Server->>Server: Derive ShareKey = Argon2id(TrusteePassword, Salt)
        Server->>Server: AES-256-GCM Encrypt Share under ShareKey
        Server->>DB: Insert into KeyShare table
    end
    Server->>Server: RSA-OAEP Encrypt ExamKEK under Examiner Public Key
    Server->>DB: Insert into ExamKEKMetadata table
    Server-->>Examiner: Exam Created (Exam ID returned)

    Examiner->>Server: POST /api/exam/[id]/upload-paper (Questions JSON)
    loop For each Question
        Server->>Server: Generate random QuestionDEK (32 bytes)
        Server->>Server: AES-256-GCM Encrypt Question Content
        Server->>Server: Wrap QuestionDEK under ExamKEK (AES-GCM)
        Server->>DB: Store Question (Ciphertext, IV, Tag, WrappedDEK)
    end

    Examiner->>Server: POST /api/exam/[id]/upload-answers (Answer Key)
    Server->>Server: Canonicalize Answer Key (sorted keys)
    Server->>Server: Commitment = SHA-256(CanonicalKey || Salt)
    Server->>DB: Store AnswerKey (Encrypted + Commitment Hash; Salt=NULL)
    Server-->>Examiner: Upload Complete & Commitment Published
```

---

## Workflow 4: Student Examination Session & Steganographic Delivery

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant Browser as Client Browser
    participant Server as Application Server
    participant Cache as In-Process Cache

    Student->>Browser: Clicks "Start Exam"
    Browser->>Browser: Generate ephemeral ECDH-P256 Keypair
    Browser->>Server: POST /api/exam/[id]/ecdh-handshake (ClientEphPub)
    Server->>Server: Generate server ephemeral ECDH-P256 Keypair
    Server->>Server: Compute Shared Secret Z = ECDH(ServerPriv, ClientPub)
    Server->>Server: Derive {K_enc, K_auth, K_iv_seed} = HKDF(Z)
    Server->>Server: Sign Handshake Payload with Server Ed25519 Key
    Server->>Cache: Store Session Keys in sessionKeyStore (TTL: 4h)
    Server-->>Browser: Return ServerEphPub + Ed25519 Signature + SessionID
    Browser->>Browser: Compute Z & derive matching {K_enc}

    Browser->>Server: GET /api/exam/[id]/questions (Header: x-session-id)
    Server->>Cache: Retrieve ExamKEK from examKEKCache
    loop For each Question
        Server->>Server: Unwrap QuestionDEK using ExamKEK
        Server->>Server: Decrypt Question using QuestionDEK
        Server->>Server: Embed Unicode Zero-Width Steganographic Watermark (Student ID)
        Server->>Server: Re-encrypt Question under Session K_enc
    end
    Server-->>Browser: Return Session-Encrypted Questions
    Browser->>Browser: Decrypt questions locally via WebCrypto and render UI
```

---

## Workflow 5: Submission Signing, Merkle Finalization & Auto-Grading

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student
    participant Browser as Client Browser
    participant Server as Application Server
    participant DB as Database
    participant Merkle as Merkle Engine

    Student->>Browser: Clicks "Submit Exam"
    Browser->>Browser: ContentHash = SHA-256(AnswersPayload)
    Browser->>Browser: Sign ContentHash with Client ECDSA-P256 Private Key
    Browser->>Server: POST /api/exam/[id]/submit (Payload, ContentHash, ECDSA Sig, Nonce)
    Server->>Server: Verify ECDSA Signature using User.ecdsaPubKey
    Server->>Server: Generate SubmissionDEK & Encrypt Submission (AES-GCM)
    Server->>Server: Wrap SubmissionDEK under ExamKEK
    Server->>DB: Store Submission with ContentHash & ECDSA Sig

    Note over Server,Merkle: Post-Exam: Finalization & Auto-Grading
    Server->>DB: Fetch all Submissions for Exam
    Server->>Merkle: Build Merkle Tree over submission ContentHashes
    Merkle-->>Server: Return MerkleRoot + Inclusion Proofs
    Server->>DB: Update each Submission with its MerkleProof; Store MerkleRoot in Exam

    Server->>DB: Fetch Encrypted Answer Key & Reveal Salt
    Server->>Server: Decrypt Submissions & Answer Key
    loop For each Student
        Server->>Server: Compute MCQ Score & Feedback Details
        Server->>Server: Encrypt Result under ResultDEK & Wrap ResultDEK
        Server->>Server: Sign Result ContentHash with Server Ed25519 Key
        Server->>DB: Store Result Record
    end
```

---

## Workflow 6: Tamper-Evident Audit Logging & External Head Anchoring

```mermaid
sequenceDiagram
    autonumber
    participant App as Application Subsystem
    participant Audit as Audit Logger (lib/audit/chain.ts)
    participant DB as Database (AuditLog Table)
    participant GitHub as GitHub Gist / External Anchor

    App->>Audit: appendAuditLog(eventType, actorId, examId, eventData)
    Audit->>DB: Query latest sequence entry to get prevHash (or GENESIS_HASH)
    Audit->>Audit: SequenceNo = PrevSeq + 1
    Audit->>Audit: EntryHash = SHA-256(Seq || EventType || Actor || Exam || Data || Time || PrevHash)
    Audit->>Audit: Signature = Ed25519Sign(AuditPrivateKey, EntryHash)
    Audit->>DB: Insert AuditLog Record (Seq, EventType, EntryHash, PrevHash, Signature)

    Note over Audit,GitHub: Periodic External Anchor
    Audit->>DB: Retrieve Head AuditLog Entry
    Audit->>GitHub: POST /gists (Anchor EntryHash + Seq + Timestamp)
    GitHub-->>Audit: Return Gist Public URL
    Audit->>Audit: Log CHAIN_HEAD_ANCHORED Event with Gist Reference
```
