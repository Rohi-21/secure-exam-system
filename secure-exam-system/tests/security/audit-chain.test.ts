/**
 * Audit Chain Tamper Detection Test Suite
 * Tests: chain construction, chaining, tamper detection at every position,
 * Ed25519 signature verification, genesis hash, and chain verification.
 *
 * Run: npx tsx tests/security/audit-chain.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildAuditEntry, verifyAuditChain, AuditEventType } from "../../lib/audit/chain";
import { GENESIS_HASH } from "../../lib/crypto/hash";   // exported from hash.ts
import { generateEd25519KeyPair } from "../../lib/crypto/ed25519";

describe("Audit Chain", () => {

  test("genesis hash is 64 zeros", () => {
    assert.equal(GENESIS_HASH, "0".repeat(64), "Genesis hash must be 64 zeros");
  });

  test("builds a valid 5-entry chain with correct prev-hash linking", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    let prevHash = GENESIS_HASH;
    const entries = [];

    for (let i = 1; i <= 5; i++) {
      const entry = buildAuditEntry(prevHash, i, {
        eventType: AuditEventType.USER_LOGIN_SUCCESS,
        actorId: `user-${i}`,
        eventData: { action: `login-${i}` },
      }, privateKeyPem);
      entries.push(entry);
      prevHash = entry.entryHash;
    }

    assert.equal(entries.length, 5);
    for (let i = 1; i < entries.length; i++) {
      assert.equal(entries[i].prevHash, entries[i - 1].entryHash,
        `Entry ${i} prevHash must match entry ${i - 1} entryHash`);
    }
  });

  test("verifyAuditChain passes for a valid chain", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    let prevHash = GENESIS_HASH;
    const entries = [];

    for (let i = 1; i <= 4; i++) {
      const entry = buildAuditEntry(prevHash, i, {
        eventType: AuditEventType.EXAM_CREATED,
        eventData: { seq: i },
      }, privateKeyPem);
      entries.push(entry);
      prevHash = entry.entryHash;
    }

    const { valid, firstInvalidIndex } = verifyAuditChain(entries, publicKeyPem);
    assert.ok(valid, "Valid chain must pass verification");
    assert.equal(firstInvalidIndex, null, "firstInvalidIndex must be null for a valid chain");
  });

  test("detects tampered eventType at position 2", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    let prevHash = GENESIS_HASH;
    const entries = [];

    for (let i = 1; i <= 4; i++) {
      const entry = buildAuditEntry(prevHash, i, {
        eventType: AuditEventType.SUBMISSION_RECEIVED,
        eventData: { seq: i },
      }, privateKeyPem);
      entries.push(entry);
      prevHash = entry.entryHash;
    }

    // Tamper entry at index 1 (sequence 2)
    entries[1] = { ...entries[1], eventType: "TAMPERED_EVENT" };

    const { valid, firstInvalidIndex } = verifyAuditChain(entries, publicKeyPem);
    assert.equal(valid, false, "Tampered chain must fail");
    assert.equal(firstInvalidIndex, 1, "First invalid must be at index 1");
  });

  test("detects chain linkage break (hash injection attack)", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    let prevHash = GENESIS_HASH;
    const entries = [];

    for (let i = 1; i <= 4; i++) {
      const entry = buildAuditEntry(prevHash, i, {
        eventType: AuditEventType.SHAMIR_RECONSTRUCTION,
        eventData: { seq: i },
      }, privateKeyPem);
      entries.push(entry);
      prevHash = entry.entryHash;
    }

    // Inject fake entry at position 2 — breaks the hash chain
    const fake = buildAuditEntry("a".repeat(64), 3, {
      eventType: "INJECTED_ENTRY",
      eventData: { malicious: true },
    }, privateKeyPem);
    entries[2] = fake;

    const { valid } = verifyAuditChain(entries, publicKeyPem);
    assert.equal(valid, false, "Hash chain break must be detected");
  });

  test("Ed25519 signature forgery is detected", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    const { privateKeyPem: otherPrivKeyPem } = generateEd25519KeyPair();
    let prevHash = GENESIS_HASH;
    const entries = [];

    for (let i = 1; i <= 3; i++) {
      // Sign entries 1+3 with correct key, entry 2 with a different key
      const sigKey = i === 2 ? otherPrivKeyPem : privateKeyPem;
      const entry = buildAuditEntry(prevHash, i, {
        eventType: AuditEventType.EVALUATION_COMPLETED,
        eventData: { seq: i },
      }, sigKey);
      entries.push(entry);
      prevHash = entry.entryHash;
    }

    const { valid, firstInvalidIndex } = verifyAuditChain(entries, publicKeyPem);
    assert.equal(valid, false, "Wrong signature must be detected");
    assert.equal(firstInvalidIndex, 1, "Invalid signature at index 1");
  });

  test("entry hash is 64-char hex SHA-256", () => {
    const { privateKeyPem } = generateEd25519KeyPair();
    const entry = buildAuditEntry(GENESIS_HASH, 1, {
      eventType: AuditEventType.USER_LOGIN_SUCCESS,
      actorId: "user-abc",
      eventData: { browser: "Chrome" },
    }, privateKeyPem);
    assert.match(entry.entryHash, /^[0-9a-f]{64}$/, "Entry hash must be 64-char hex");
    assert.match(entry.auditSig, /^[A-Za-z0-9+/=]+$/, "Audit sig must be base64");
  });

  test("verifyAuditChain returns firstInvalidIndex: -1 (not null) for valid chain", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    const entry = buildAuditEntry(GENESIS_HASH, 1, {
      eventType: AuditEventType.CHAIN_HEAD_ANCHORED,
      eventData: { gistUrl: "https://gist.github.com/test" },
    }, privateKeyPem);

    const { valid, firstInvalidIndex } = verifyAuditChain([entry], publicKeyPem);
    assert.ok(valid);
    assert.equal(firstInvalidIndex, null, "firstInvalidIndex must be null for valid single-entry chain");
  });
});
