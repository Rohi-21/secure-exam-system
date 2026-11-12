-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usn" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT NOT NULL,
    "ed25519PubKey" TEXT,
    "ecdsaPubKey" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExaminerKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examinerId" TEXT NOT NULL,
    "rsaPublicKey" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "ExaminerKey_examinerId_fkey" FOREIGN KEY ("examinerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "durationMins" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrolledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamEnrollment_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamKEKMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "examinerKeyId" TEXT NOT NULL,
    "wrappedKEKRSA" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'RSA-OAEP-SHA256',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamKEKMetadata_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamKEKMetadata_examinerKeyId_fkey" FOREIGN KEY ("examinerKeyId") REFERENCES "ExaminerKey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeyShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "trusteeId" TEXT NOT NULL,
    "encryptedShare" TEXT NOT NULL,
    "shareIv" TEXT NOT NULL,
    "shareAuthTag" TEXT NOT NULL,
    "argon2Salt" TEXT NOT NULL,
    "shareIndex" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 2,
    "totalShares" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeyShare_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KeyShare_trusteeId_fkey" FOREIGN KEY ("trusteeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "questionNo" INTEGER NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "aad" TEXT NOT NULL,
    "wrappedDEK" TEXT NOT NULL,
    "dekIv" TEXT NOT NULL,
    "dekAuthTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnswerKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "aad" TEXT NOT NULL,
    "wrappedDEK" TEXT NOT NULL,
    "dekIv" TEXT NOT NULL,
    "dekAuthTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "commitment" TEXT NOT NULL,
    "commitmentSalt" TEXT,
    "revealedAt" DATETIME,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnswerKey_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "handshakeNonce" TEXT NOT NULL,
    CONSTRAINT "ExamSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "aad" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL,
    "ecdsaSignature" TEXT NOT NULL,
    "submissionNonce" TEXT NOT NULL,
    "merkleProof" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Submission_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubmissionDEK" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "wrappedDEK" TEXT NOT NULL,
    "dekIv" TEXT NOT NULL,
    "dekAuthTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SubmissionDEK_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "aad" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "examinerSignature" TEXT NOT NULL,
    "merkleRoot" TEXT,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Result_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Result_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResultDEK" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resultId" TEXT NOT NULL,
    "wrappedDEK" TEXT NOT NULL,
    "dekIv" TEXT NOT NULL,
    "dekAuthTag" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ResultDEK_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "Result" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsedNonce" (
    "nonce" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceNo" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "examId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "eventData" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "entryHash" TEXT NOT NULL,
    "auditSig" TEXT NOT NULL,
    CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_usn_key" ON "User"("usn");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminerKey_examinerId_key" ON "ExaminerKey"("examinerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamEnrollment_examId_studentId_key" ON "ExamEnrollment"("examId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamKEKMetadata_examId_key" ON "ExamKEKMetadata"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "KeyShare_examId_trusteeId_key" ON "KeyShare"("examId", "trusteeId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_examId_questionNo_key" ON "Question"("examId", "questionNo");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerKey_examId_key" ON "AnswerKey"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_handshakeNonce_key" ON "ExamSession"("handshakeNonce");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_studentId_examId_key" ON "ExamSession"("studentId", "examId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_sessionId_key" ON "Submission"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_submissionNonce_key" ON "Submission"("submissionNonce");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionDEK_submissionId_key" ON "SubmissionDEK"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_submissionId_key" ON "Result"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultDEK_resultId_key" ON "ResultDEK"("resultId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_sequenceNo_key" ON "AuditLog"("sequenceNo");
