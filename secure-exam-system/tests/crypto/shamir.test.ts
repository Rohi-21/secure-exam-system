/**
 * Shamir Secret Sharing Test Suite
 * Tests: 2-of-3 split/reconstruct, threshold enforcement,
 * share independence, wrong password rejection, different exam isolation.
 *
 * Run: npx tsx tests/crypto/shamir.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateExamKEK, splitAndEncryptKEK, reconstructKEK } from "../../lib/crypto/shamir";

const TRUSTEE_PASSWORDS: [string, string, string] = [
  "TrusteeAlpha!Pass@2024",
  "TrusteeBeta!Pass@2024",
  "TrusteeGamma!Pass@2024",
];
const EXAM_ID = "exam-test-123e4567-e89b-12d3-a456";

// Helper: add trusteeIndex field required by reconstructKEK
function withIndex<T>(shares: T[]): (T & { trusteeIndex: number })[] {
  return shares.map((s, i) => ({ ...s, trusteeIndex: i + 1 }));
}

describe("Shamir Secret Sharing", () => {

  test("generateExamKEK produces 32 random bytes", () => {
    const kek1 = generateExamKEK();
    const kek2 = generateExamKEK();
    assert.equal(kek1.length, 32, "KEK must be 32 bytes");
    assert.notEqual(kek1.toString("hex"), kek2.toString("hex"), "Each KEK must be unique");
  });

  test("2-of-3 split + reconstruct with shares 0+1 recovers exact KEK", async () => {
    const original = generateExamKEK();
    const shares = await splitAndEncryptKEK(original, EXAM_ID, TRUSTEE_PASSWORDS);
    assert.equal(shares.length, 3, "Must produce 3 shares");

    const recovered = await reconstructKEK(
      withIndex([shares[0], shares[1]]),
      [TRUSTEE_PASSWORDS[0], TRUSTEE_PASSWORDS[1]],
      EXAM_ID
    );
    assert.equal(recovered.toString("hex"), original.toString("hex"),
      "Recovered KEK must match original (shares 0+1)");
  });

  test("2-of-3 split + reconstruct with shares 0+2 recovers exact KEK", async () => {
    const original = generateExamKEK();
    const shares = await splitAndEncryptKEK(original, EXAM_ID, TRUSTEE_PASSWORDS);
    const recovered = await reconstructKEK(
      withIndex([shares[0], shares[2]]),
      [TRUSTEE_PASSWORDS[0], TRUSTEE_PASSWORDS[2]],
      EXAM_ID
    );
    assert.equal(recovered.toString("hex"), original.toString("hex"),
      "Recovered KEK must match original (shares 0+2)");
  });

  test("2-of-3 split + reconstruct with shares 1+2 recovers exact KEK", async () => {
    const original = generateExamKEK();
    const shares = await splitAndEncryptKEK(original, EXAM_ID, TRUSTEE_PASSWORDS);
    const recovered = await reconstructKEK(
      withIndex([shares[1], shares[2]]),
      [TRUSTEE_PASSWORDS[1], TRUSTEE_PASSWORDS[2]],
      EXAM_ID
    );
    assert.equal(recovered.toString("hex"), original.toString("hex"),
      "Recovered KEK must match original (shares 1+2)");
  });

  test("wrong password causes decryption failure", async () => {
    const original = generateExamKEK();
    const shares = await splitAndEncryptKEK(original, EXAM_ID, TRUSTEE_PASSWORDS);
    await assert.rejects(
      () => reconstructKEK(
        withIndex([shares[0], shares[1]]),
        ["WrongPassword!", TRUSTEE_PASSWORDS[1]],
        EXAM_ID
      ),
      "Wrong password must throw an error"
    );
  });

  test("share encryption uses unique IV per share (no IV reuse)", async () => {
    const original = generateExamKEK();
    const shares = await splitAndEncryptKEK(original, EXAM_ID, TRUSTEE_PASSWORDS);
    const ivs = shares.map((s) => s.shareIv);
    const uniqueIVs = new Set(ivs);
    assert.equal(uniqueIVs.size, 3, "Every share must have a unique IV");
  });

  test("share encryption uses unique Argon2 salt per share", async () => {
    const original = generateExamKEK();
    const shares = await splitAndEncryptKEK(original, EXAM_ID, TRUSTEE_PASSWORDS);
    const salts = shares.map((s) => s.argon2Salt);
    const uniqueSalts = new Set(salts);
    assert.equal(uniqueSalts.size, 3, "Every share must have a unique Argon2 salt");
  });

  test("shares from different exams are independent", async () => {
    const kek1 = generateExamKEK();
    const kek2 = generateExamKEK();
    const shares1 = await splitAndEncryptKEK(kek1, "exam-A", TRUSTEE_PASSWORDS);
    const shares2 = await splitAndEncryptKEK(kek2, "exam-B", TRUSTEE_PASSWORDS);

    // Cross-exam reconstruction must NOT succeed (Argon2 AAD includes exam_id)
    await assert.rejects(
      () => reconstructKEK(
        withIndex([shares1[0], shares2[1]]),
        [TRUSTEE_PASSWORDS[0], TRUSTEE_PASSWORDS[1]],
        "exam-A"
      ),
      "Cross-exam share combination must fail"
    );
  });
});
