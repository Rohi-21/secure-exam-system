/**
 * SHA-256 Cryptographic Commitment Scheme (Commit-Reveal)
 *
 * NOT a Zero-Knowledge Proof.
 * This is a hash-based commit-reveal scheme.
 *
 * Security property: The answer key commitment is published before the exam starts.
 * SHA-256 preimage resistance guarantees the answer key cannot be changed
 * after commitment without detection.
 *
 * External publication (email to students + GitHub Gist) is required to protect
 * against a privileged DB administrator replacing both the answer key and commitment.
 */

import { randomBytes } from "crypto";
import { sha256Hex } from "./hash";

export interface AnswerKeyCommitment {
  commitment: string; // hex SHA-256(canonical_key_bytes + salt_bytes)
  salt: string;       // hex — stored null until post-exam reveal
}

/**
 * Canonical serialisation of the answer key.
 * Keys sorted alphabetically; deterministic output.
 */
export function canonicaliseAnswerKey(
  examId: string,
  answers: Record<string, string>, // e.g. { "1": "B", "2": "A" }
  version: number = 1
): string {
  const sortedAnswers = Object.fromEntries(
    Object.entries(answers).sort(([a], [b]) => a.localeCompare(b))
  );
  const obj = { exam_id: examId, version, answers: sortedAnswers };
  return JSON.stringify(obj); // deterministic — no whitespace
}

/**
 * Generate a commitment for the answer key BEFORE the exam opens.
 * @param examId  UUID of the exam
 * @param answers  Plain answer key map
 */
export function generateCommitment(
  examId: string,
  answers: Record<string, string>
): AnswerKeyCommitment {
  const salt = randomBytes(32); // 256-bit random blinding factor
  const canonical = canonicaliseAnswerKey(examId, answers);
  const input = Buffer.concat([
    Buffer.from(canonical, "utf-8"),
    salt,
  ]);
  return {
    commitment: sha256Hex(input),
    salt: salt.toString("hex"),
  };
}

/**
 * Verify a commitment after the exam (post-exam reveal).
 * @param commitment  Pre-published commitment hex string
 * @param examId      Exam UUID
 * @param answers     Revealed answer key
 * @param saltHex     Revealed salt hex string
 * @returns true if the revealed key matches the commitment
 */
export function verifyCommitment(
  commitment: string,
  examId: string,
  answers: Record<string, string>,
  saltHex: string
): boolean {
  const salt = Buffer.from(saltHex, "hex");
  const canonical = canonicaliseAnswerKey(examId, answers);
  const input = Buffer.concat([
    Buffer.from(canonical, "utf-8"),
    salt,
  ]);
  const recomputed = sha256Hex(input);
  return recomputed === commitment;
}
