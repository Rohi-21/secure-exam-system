/**
 * SHA-256 Merkle Tree
 * Used for: batch integrity proof over exam submissions
 *
 * Property: Once the Merkle root is committed, no submission can be
 * silently added, removed, or modified without changing the root.
 *
 * Students receive a Merkle proof (inclusion proof) that their submission
 * is part of the official batch, without revealing other students' data.
 */

import { sha256Hex } from "./hash";

/** A single node in the Merkle tree */
interface MerkleNode {
  hash: string; // hex SHA-256
  left?: MerkleNode;
  right?: MerkleNode;
}

/** Proof of inclusion for a single leaf */
export interface MerkleProof {
  leafHash: string;         // The leaf's hash
  leafIndex: number;         // Position in the original sorted array
  siblings: Array<{
    hash: string;
    side: "left" | "right";
  }>;
  root: string;              // Expected root (should match stored root)
}

/**
 * Hash a leaf: H(leaf_data)
 * Prefix with "leaf:" to prevent second-preimage attacks (leaf vs internal node confusion)
 */
function hashLeaf(data: string): string {
  return sha256Hex(Buffer.from("leaf:" + data, "utf-8"));
}

/**
 * Hash two child nodes: H(left || right)
 * Prefix with "node:" to distinguish from leaf hashes
 */
function hashNode(left: string, right: string): string {
  return sha256Hex(Buffer.from("node:" + left + right, "utf-8"));
}

/**
 * Build a Merkle tree from an array of leaf data strings.
 * @param leaves  Array of string data (e.g. submission content hashes, sorted by student ID)
 * @returns { root: hex root hash, tree: internal tree structure }
 */
export function buildMerkleTree(leaves: string[]): {
  root: string;
  leafHashes: string[];
} {
  if (leaves.length === 0) {
    return { root: sha256Hex("empty"), leafHashes: [] };
  }

  let level: string[] = leaves.map(hashLeaf);
  const leafHashes = [...level];

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? level[i]; // duplicate last node if odd count
      nextLevel.push(hashNode(left, right));
    }
    level = nextLevel;
  }

  return { root: level[0], leafHashes };
}

/**
 * Generate a Merkle inclusion proof for a specific leaf.
 * @param leaves      Original leaf data array (same order as buildMerkleTree)
 * @param leafIndex   Index of the leaf to prove
 */
export function generateMerkleProof(
  leaves: string[],
  leafIndex: number
): MerkleProof {
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(`Leaf index ${leafIndex} out of range (${leaves.length} leaves)`);
  }

  let level: string[] = leaves.map(hashLeaf);
  const { root } = buildMerkleTree(leaves);
  const siblings: MerkleProof["siblings"] = [];
  let idx = leafIndex;

  while (level.length > 1) {
    const isRightChild = idx % 2 === 1;
    const siblingIdx = isRightChild ? idx - 1 : idx + 1;
    const sibling = level[siblingIdx] ?? level[idx]; // handle odd count

    siblings.push({
      hash: sibling,
      side: isRightChild ? "left" : "right",
    });

    // Move to next level
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i];
      const r = level[i + 1] ?? level[i];
      nextLevel.push(hashNode(l, r));
    }
    level = nextLevel;
    idx = Math.floor(idx / 2);
  }

  return {
    leafHash: hashLeaf(leaves[leafIndex]),
    leafIndex,
    siblings,
    root,
  };
}

/**
 * Verify a Merkle inclusion proof.
 * @param proof  The proof returned by generateMerkleProof
 * @param expectedRoot  The committed Merkle root
 * @returns true if the proof is valid
 */
export function verifyMerkleProof(
  proof: MerkleProof,
  expectedRoot: string
): boolean {
  let current = proof.leafHash;

  for (const sibling of proof.siblings) {
    current =
      sibling.side === "left"
        ? hashNode(sibling.hash, current)
        : hashNode(current, sibling.hash);
  }

  return current === expectedRoot && expectedRoot === proof.root;
}
