/**
 * Tamper-evident SHA-256 Hash Chain Audit Log
 *
 * Properties:
 * - Each entry includes SHA-256(this_entry_data + prev_entry_hash)
 * - Each entry is signed with the audit Ed25519 key (separate from server identity)
 * - Any modification to a past entry changes its hash → breaks all subsequent hashes
 * - Chain head is periodically published externally (GitHub Gist + email to participants)
 *
 * What this provides: DETECTION of tampering by any party holding a past chain head
 * What this does NOT provide: prevention of tampering by a fully malicious server admin
 * Mitigation: external anchoring — admin cannot retroactively alter GitHub Gist history
 */

import { createHash, createSign, createVerify, createPrivateKey, createPublicKey } from "crypto";
import { hashChainEntry, sha256Hex, GENESIS_HASH } from "../crypto/hash";
import { ed25519Sign, ed25519Verify } from "../crypto/ed25519";

export interface AuditEntry {
  sequenceNo: number;
  eventType: string;
  actorId?: string;
  examId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  eventData: Record<string, unknown>;
  timestamp: string;        // ISO 8601
  prevHash: string;         // hex SHA-256 of previous entry
  entryHash: string;        // hex SHA-256(this entry + prevHash)
  auditSig: string;         // base64 Ed25519 signature over entryHash
}

/**
 * Compute the hash for a new audit entry.
 * entryHash = SHA-256(JSON(eventType, actorId, examId, eventData, timestamp, sequenceNo) + prevHash)
 */
export function computeEntryHash(
  entry: Omit<AuditEntry, "entryHash" | "auditSig">,
): string {
  const dataToHash = {
    sequenceNo: entry.sequenceNo,
    eventType: entry.eventType,
    actorId: entry.actorId ?? null,
    examId: entry.examId ?? null,
    resourceType: entry.resourceType ?? null,
    resourceId: entry.resourceId ?? null,
    eventData: entry.eventData,
    timestamp: entry.timestamp,
  };
  return hashChainEntry(dataToHash, entry.prevHash);
}

/**
 * Build a new signed audit log entry.
 * @param prevHash     The hash of the immediately preceding entry (GENESIS_HASH for first)
 * @param sequenceNo   Monotonically increasing sequence number
 * @param event        Event details
 * @param auditPrivKeyPem  Ed25519 private key for the audit log signing key
 */
export function buildAuditEntry(
  prevHash: string,
  sequenceNo: number,
  event: {
    eventType: string;
    actorId?: string;
    examId?: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    eventData: Record<string, unknown>;
  },
  auditPrivKeyPem: string
): AuditEntry {
  const timestamp = new Date().toISOString();

  const partial: Omit<AuditEntry, "entryHash" | "auditSig"> = {
    sequenceNo,
    prevHash,
    timestamp,
    ...event,
    eventData: event.eventData,
  };

  const entryHash = computeEntryHash(partial);
  const auditSig = ed25519Sign(auditPrivKeyPem, Buffer.from(entryHash, "hex"));

  return { ...partial, entryHash, auditSig };
}

/**
 * Verify the entire audit chain from genesis.
 * @param entries     All entries in ascending sequenceNo order
 * @param auditPubKeyPem  Ed25519 public key for the audit log signing key
 * @returns { valid: boolean, firstInvalidIndex: number | null }
 */
export function verifyAuditChain(
  entries: AuditEntry[],
  auditPubKeyPem: string
): { valid: boolean; firstInvalidIndex: number | null } {
  let prevHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check sequence
    if (entry.sequenceNo !== i + 1) {
      return { valid: false, firstInvalidIndex: i };
    }

    // Check prevHash linkage
    if (entry.prevHash !== prevHash) {
      return { valid: false, firstInvalidIndex: i };
    }

    // Recompute entryHash
    const recomputed = computeEntryHash({
      sequenceNo: entry.sequenceNo,
      eventType: entry.eventType,
      actorId: entry.actorId,
      examId: entry.examId,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress,
      eventData: entry.eventData,
      timestamp: entry.timestamp,
      prevHash: entry.prevHash,
    });

    if (recomputed !== entry.entryHash) {
      return { valid: false, firstInvalidIndex: i };
    }

    // Verify Ed25519 signature
    const sigValid = ed25519Verify(
      auditPubKeyPem,
      Buffer.from(entry.entryHash, "hex"),
      entry.auditSig
    );

    if (!sigValid) {
      return { valid: false, firstInvalidIndex: i };
    }

    prevHash = entry.entryHash;
  }

  return { valid: true, firstInvalidIndex: null };
}

/** Standard audit event types */
export const AuditEventType = {
  USER_REGISTERED: "USER_REGISTERED",
  USER_LOGIN_SUCCESS: "USER_LOGIN_SUCCESS",
  USER_LOGIN_FAILED: "USER_LOGIN_FAILED",
  USER_LOCKED: "USER_LOCKED",
  EXAM_CREATED: "EXAM_CREATED",
  EXAM_PAPER_UPLOADED: "EXAM_PAPER_UPLOADED",
  COMMITMENT_PUBLISHED: "COMMITMENT_PUBLISHED",
  EXAM_SESSION_STARTED: "EXAM_SESSION_STARTED",
  SUBMISSION_RECEIVED: "SUBMISSION_RECEIVED",
  SHAMIR_RECONSTRUCTION: "SHAMIR_RECONSTRUCTION",
  EVALUATION_COMPLETED: "EVALUATION_COMPLETED",
  COMMITMENT_REVEALED: "COMMITMENT_REVEALED",
  RESULT_RELEASED: "RESULT_RELEASED",
  CHAIN_HEAD_ANCHORED: "CHAIN_HEAD_ANCHORED",
} as const;
