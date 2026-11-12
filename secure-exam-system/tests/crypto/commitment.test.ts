/**
 * Commitment Scheme Test Suite
 * Tests: generate/verify cycle, salt uniqueness, canonical form,
 * tamper detection (wrong answers, wrong exam, wrong salt).
 *
 * Run: npx tsx tests/crypto/commitment.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateCommitment, verifyCommitment, canonicaliseAnswerKey } from "../../lib/crypto/commitment";

const EXAM_ID = "exam-commit-test-abc123";
const ANSWERS = { "1": "A", "2": "C", "3": "B", "4": "D", "5": "A" };

describe("Commit-Reveal Scheme", () => {

  test("commitment is 64-char hex SHA-256", () => {
    const { commitment } = generateCommitment(EXAM_ID, ANSWERS);
    assert.match(commitment, /^[0-9a-f]{64}$/, "Commitment must be hex SHA-256");
  });

  test("salt is 32-byte random hex (64 chars)", () => {
    const { salt } = generateCommitment(EXAM_ID, ANSWERS);
    assert.match(salt, /^[0-9a-f]{64}$/, "Salt must be 64-char hex");
  });

  test("two commitments for same input differ (salt is random)", () => {
    const { commitment: c1, salt: s1 } = generateCommitment(EXAM_ID, ANSWERS);
    const { commitment: c2, salt: s2 } = generateCommitment(EXAM_ID, ANSWERS);
    assert.notEqual(s1, s2, "Salts must be unique");
    assert.notEqual(c1, c2, "Commitments with different salts must differ");
  });

  test("verify returns true for correct answers + salt", () => {
    const { commitment, salt } = generateCommitment(EXAM_ID, ANSWERS);
    assert.ok(verifyCommitment(commitment, EXAM_ID, ANSWERS, salt), "Correct reveal must verify");
  });

  test("verify rejects wrong answer", () => {
    const { commitment, salt } = generateCommitment(EXAM_ID, ANSWERS);
    const wrong = { ...ANSWERS, "1": "B" }; // Changed answer
    assert.equal(verifyCommitment(commitment, EXAM_ID, wrong, salt), false,
      "Wrong answer must fail verification");
  });

  test("verify rejects wrong salt", () => {
    const { commitment } = generateCommitment(EXAM_ID, ANSWERS);
    const wrongSalt = "0".repeat(64);
    assert.equal(verifyCommitment(commitment, EXAM_ID, ANSWERS, wrongSalt), false,
      "Wrong salt must fail verification");
  });

  test("verify rejects wrong exam ID", () => {
    const { commitment, salt } = generateCommitment(EXAM_ID, ANSWERS);
    assert.equal(verifyCommitment(commitment, "different-exam-id", ANSWERS, salt), false,
      "Wrong exam ID must fail verification");
  });

  test("canonical form is deterministic regardless of key insertion order", () => {
    const shuffled = { "5": "A", "2": "C", "1": "A", "4": "D", "3": "B" };
    const c1 = canonicaliseAnswerKey(EXAM_ID, ANSWERS);
    const c2 = canonicaliseAnswerKey(EXAM_ID, shuffled);
    assert.equal(c1, c2, "Canonical form must be order-independent");
  });
});
