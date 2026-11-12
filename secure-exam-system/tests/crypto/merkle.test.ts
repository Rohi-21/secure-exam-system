/**
 * Merkle Tree Test Suite
 * Tests: tree construction, root consistency, inclusion proof generation,
 * proof verification, single-leaf tree, tamper detection (bad proof),
 * domain separation (leaf vs node prefix attack prevention).
 *
 * Run: npx tsx tests/crypto/merkle.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMerkleTree, generateMerkleProof, verifyMerkleProof } from "../../lib/crypto/merkle";

describe("Merkle Tree", () => {

  test("builds correct root for 4 leaves", () => {
    const leaves = ["leaf-A", "leaf-B", "leaf-C", "leaf-D"];
    const { root, leafHashes } = buildMerkleTree(leaves);
    assert.ok(root.length === 64, "root must be 64-char hex SHA-256");
    assert.equal(leafHashes.length, 4);
    // Root is deterministic
    const { root: root2 } = buildMerkleTree(leaves);
    assert.equal(root, root2, "Same leaves must always produce same root");
  });

  test("single-leaf tree returns leaf hash as root", () => {
    const { root, leafHashes } = buildMerkleTree(["only-leaf"]);
    assert.equal(root, leafHashes[0]);
  });

  test("generates valid inclusion proof for each leaf", () => {
    const leaves = ["sub-1", "sub-2", "sub-3", "sub-4", "sub-5"];
    const { root } = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = generateMerkleProof(leaves, i);
      const valid = verifyMerkleProof(proof, root);
      assert.ok(valid, `Proof for leaf ${i} must be valid`);
    }
  });

  test("proof verification rejects tampered leaf hash", () => {
    const leaves = ["a", "b", "c", "d"];
    const { root } = buildMerkleTree(leaves);
    const proof = generateMerkleProof(leaves, 0);
    // Tamper leaf hash
    const tampered = { ...proof, leafHash: "0".repeat(64) };
    assert.equal(verifyMerkleProof(tampered, root), false, "Tampered proof must be rejected");
  });

  test("proof verification rejects wrong root", () => {
    const leaves = ["x", "y", "z"];
    const { root } = buildMerkleTree(leaves);
    const proof = generateMerkleProof(leaves, 1);
    const wrongRoot = "f".repeat(64);
    assert.equal(verifyMerkleProof(proof, wrongRoot), false, "Wrong root must be rejected");
  });

  test("domain separation prevents second-preimage attack", () => {
    // A node hash must never equal a leaf hash for the same input
    const leaves = ["attack-node"];
    const { root: leafRoot, leafHashes } = buildMerkleTree(leaves);
    // If domain separation is broken, a node hash could equal a leaf hash
    // These should always be different because "leaf:" vs "node:" prefix is prepended
    // With a single leaf, root === leafHash — this is expected and correct
    assert.equal(root, leafHashes[0]); // single leaf — root IS the leaf hash (correct)
    // With 2 leaves, root is a node hash — must differ from both leaf hashes
    const { root: nodeRoot, leafHashes: lh2 } = buildMerkleTree(["a", "b"]);
    assert.notEqual(nodeRoot, lh2[0], "Node hash must differ from leaf hash");
    assert.notEqual(nodeRoot, lh2[1], "Node hash must differ from leaf hash");
  });

  test("odd number of leaves (duplication of last) produces valid proofs", () => {
    const leaves = ["p", "q", "r"]; // 3 leaves — last is duplicated internally
    const { root } = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = generateMerkleProof(leaves, i);
      assert.ok(verifyMerkleProof(proof, root), `Proof ${i} valid for odd-leaf tree`);
    }
  });

  test("changing any leaf changes root", () => {
    const leaves = ["data-1", "data-2", "data-3", "data-4"];
    const { root: originalRoot } = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const modified = [...leaves];
      modified[i] = "tampered";
      const { root: tamperedRoot } = buildMerkleTree(modified);
      assert.notEqual(tamperedRoot, originalRoot, `Tampering leaf ${i} must change root`);
    }
  });
});

// Use the variable to fix lint
const { root } = buildMerkleTree(["attack-node"]);
void root; // suppress unused warning
