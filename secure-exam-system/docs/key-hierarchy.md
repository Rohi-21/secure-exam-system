# Cryptographic Key Hierarchy & Key Management Architecture

**Secure Online Examination System Using Cryptography**  
Department of Computer Science & Engineering, KLE Technological University  

---

## 1. Multi-Tier Key Architecture Overview

The system strictly adheres to the principle of cryptographic separation and key encapsulation. No single master key or single point of compromise exposes all examination assets.

```
+-----------------------------------------------------------------------------------+
|  Level 1: Exam Key Encryption Key (ExamKEK)                                       |
|  - 256-bit CSPRNG key (crypto.randomBytes(32))                                    |
|  - Unique per examination instance                                                |
|  - NEVER stored plaintext anywhere in database or persistent disk                 |
+-----------------------------------------------------------------------------------+
             |                                                  |
             v                                                  v
+-------------------------------+             +-------------------------------------+
|  Custody Path A (Multi-Party) |             |  Custody Path B (Emergency Backup)  |
|  - Shamir's 2-of-3 SSS        |             |  - RSA-2048 / OAEP-SHA256           |
|  - 3 Polynomial Shares        |             |  - Wrapped under Examiner Public Key|
|  - AES-256-GCM encrypted under|             |  - Stored in ExamKEKMetadata table  |
|    Argon2id(trustee_password) |             +-------------------------------------+
+-------------------------------+                               |
             |                                                  |
             +--------------------+-----------------------------+
                                  |
                                  v
+-----------------------------------------------------------------------------------+
|  Level 2: Data Encryption Keys (DEKs)                                             |
|  - 256-bit random keys per individual record / asset                              |
|  - Questions (1 DEK per question record)                                          |
|  - Answer Keys (1 DEK per answer key record)                                      |
|  - Student Submissions (1 DEK per student submission record)                       |
|  - Graded Results (1 DEK per student result record)                               |
|  - Stored wrapped in DB as: AES-256-GCM(ExamKEK, DEK, AAD: {record_id, exam_id})  |
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
|  Level 3: Ephemeral Application-Layer Session Keys                                |
|  - ECDH-P256 Ephemeral Key Pair generated on Student Browser (WebCrypto)          |
|  - ECDH-P256 Ephemeral Key Pair generated on Application Server                   |
|  - Shared Secret: Z = ECDH(ServerPriv, ClientPub) = ECDH(ClientPriv, ServerPub)   |
|  - Derived Keys via HKDF-SHA256(Z, salt: sessionId):                              |
|      * K_enc (32 bytes AES-256-GCM for payload encryption)                        |
|      * K_auth (32 bytes HMAC / integrity key)                                     |
|      * K_iv_seed (16 bytes IV seed for nonce sequencing)                          |
|  - In-process memory only with strict TTL (4 hours). Never written to DB.        |
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
|  Level 4: Client-Side Ephemeral Draft Protection Keys                             |
|  - WebCrypto AES-GCM 256-bit CryptoKey                                            |
|  - Non-exportable, generated in browser memory                                    |
|  - Encrypts in-flight local draft answers in browser sessionStorage               |
+-----------------------------------------------------------------------------------+
```

---

## 2. Key Lifecycle Specification

### 2.1 ExamKEK (Level 1)
1. **Generation:** Generated at exam creation (`/api/exam/create`) via cryptographic PRNG: `randomBytes(32)`.
2. **Shamir Splitting:**
   - Evaluated as a polynomial of degree $k - 1 = 1$ over Galois Field $GF(2^8)$ using threshold $t = 2$ and $n = 3$ shares.
   - For each trustee $i \in \{1, 2, 3\}$, a 128-bit salt is sampled: $S_i \leftarrow \text{randomBytes}(16)$.
   - Key derivation: $K_{share, i} \leftarrow \text{Argon2id}(\text{password}_i, S_i, m=64\text{MB}, t=3, p=4)$.
   - Share encryption: $C_{share, i} \leftarrow \text{AES-256-GCM}(K_{share, i}, \text{Share}_i, \text{AAD}: \text{examId} \mathbin{\Vert} \text{shareIndex})$.
   - The original ExamKEK is zeroed out from local scope immediately after splitting.
3. **Reconstruction Ceremony:**
   - Any 2 authorized trustees submit their credentials (`POST /api/keys/reconstruct`).
   - The server verifies each password against the corresponding share using authenticated decryption.
   - Using Lagrange polynomial interpolation:
     $$f(0) = \sum_{j=1}^{2} y_j \prod_{m \neq j} \frac{-x_m}{x_j - x_m} \pmod{GF(2^8)}$$
   - The recovered ExamKEK is held in a volatile in-process LRU cache (`examKEKCache`) with an enforced 1-hour expiration.

### 2.2 Asset DEKs (Level 2)
1. **Question Encryption:**
   - Each question has its own randomly generated DEK: $DEK_q \leftarrow \text{randomBytes}(32)$.
   - Question plaintext is encrypted: $C_q \leftarrow \text{AES-256-GCM}(DEK_q, P_q, \text{AAD}_q)$.
   - The DEK is wrapped: $W_{DEK_q} \leftarrow \text{AES-256-GCM}(\text{ExamKEK}, DEK_q, \text{AAD}_{dek})$.
   - $DEK_q$ is discarded from memory.
2. **Decryption & Trans-encryption During Delivery:**
   - To serve a question to a student, the server unwraps $DEK_q$ using cached $\text{ExamKEK}$.
   - Decrypts question content $P_q$.
   - Re-encrypts $P_q$ under the student's ephemeral session key $K_{enc}$.
   - The raw question is never sent in cleartext, even inside TLS termination buffers.

### 2.3 Ephemeral Session Keys (Level 3 - ECDH & PFS)
1. Provides **Perfect Forward Secrecy (PFS)** independent of the transport layer.
2. Both parties generate ephemeral NIST P-256 (prime256v1) keypairs.
3. The server signs the handshake tuple:
   $$\sigma_{server} \leftarrow \text{Ed25519Sign}(SK_{server}, PK_{server}^{eph} \mathbin{\Vert} PK_{client}^{eph} \mathbin{\Vert} \text{examId} \mathbin{\Vert} \text{sessionId} \mathbin{\Vert} \text{nonce} \mathbin{\Vert} \text{timestamp})$$
4. Anti-replay tracking: Handshake nonces are enforced and single-use.

---

## 3. Cryptographic Storage Matrix

| Data Asset | Encryption Method | Key Custody / Reference | Stored in DB? |
|---|---|---|---|
| Question Text & Options | AES-256-GCM | Wrapped under ExamKEK via unique QuestionDEK | Yes (Ciphertext + Tag + IV) |
| Official Answer Key | AES-256-GCM | Wrapped under ExamKEK via unique AnswerDEK | Yes (Ciphertext + Tag + IV) |
| Answer Key Commitment | SHA-256 | Immutable hash: $\text{SHA-256}(\text{CanonicalKey} \mathbin{\Vert} \text{Salt})$ | Yes (Published pre-exam) |
| Student Submission | AES-256-GCM + ECDSA | Wrapped under ExamKEK via SubmissionDEK; signed with student ECDSA key | Yes (Ciphertext + Tag + IV) |
| Exam Results & Feedback | AES-256-GCM + Ed25519 | Wrapped under ExamKEK via ResultDEK; signed with server Ed25519 key | Yes (Ciphertext + Tag + IV) |
| Audit Trail Entries | SHA-256 Chain + Ed25519 | Signed sequentially with server Audit Ed25519 key | Yes (Append-only chain) |
| ExamKEK | Shamir SSS 2-of-3 | 3 Argon2id-encrypted shares | Only encrypted shares in DB |
| Session Keys ($K_{enc}, K_{auth}$) | Ephemeral ECDH | Discarded after TTL | **NEVER** stored in DB |
