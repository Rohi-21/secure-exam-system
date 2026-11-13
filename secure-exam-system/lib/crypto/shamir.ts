/**
 * Shamir's Secret Sharing — per-exam ExamKEK distribution
 *
 * Design decisions:
 * - Each exam has its own independently random ExamKEK (no global MasterKey)
 * - Per-exam compartmentalisation: compromising one exam's ceremony ≠ compromising all
 * - Each Shamir share is encrypted with Argon2id(trustee_password, per-trustee_salt)
 * - The ExamKEK itself is NEVER stored — only the 3 encrypted shares + RSA-wrapped KEK
 *
 * What Shamir protects here:
 *   ✅ No single administrator can decrypt exam data alone
 *   ✅ Database breach — only encrypted shares visible (useless without trustee passwords)
 *   ✅ Per-exam blast radius containment
 *   ❌ Application-server process compromise during reconstruction (ExamKEK in RAM briefly)
 *   ❌ Two colluding trustees (standard Shamir assumption)
 */

import sss from "shamirs-secret-sharing";
import { randomBytes } from "crypto";
import { encryptAES256GCM, decryptAES256GCM, generateDEK } from "./aes";
import { argon2idDeriveKey, generateArgon2Salt } from "./kdf";

export interface EncryptedShare {
  encryptedShare: string; // base64 AES-GCM ciphertext
  shareIv: string;        // base64
  shareAuthTag: string;   // base64
  argon2Salt: string;     // base64 — stored so trustee can re-derive their key
  shareIndex: number;
}

/**
 * Split an ExamKEK into 2-of-3 Shamir shares, encrypting each with the trustee's password.
 *
 * @param examKEK       32-byte ExamKEK to split
 * @param examId        UUID of the exam (used in AAD)
 * @param passwords     Array of 3 trustee passwords
 * @returns Array of 3 EncryptedShare objects, one per trustee
 */
export async function splitAndEncryptKEK(
  examKEK: Buffer,
  examId: string,
  passwords: [string, string, string]
): Promise<EncryptedShare[]> {
  // Split into 3 shares, threshold 2
  const shares: Buffer[] = sss.split(examKEK, { shares: 3, threshold: 2 });

  const encryptedShares: EncryptedShare[] = [];

  for (let i = 0; i < shares.length; i++) {
    const salt = generateArgon2Salt();
    const shareKey = await argon2idDeriveKey(passwords[i], salt);

    const aad = {
      record_id: `${examId}-share-${i + 1}`,
      record_type: "key_share" as const,
      exam_id: examId,
      key_version: 1,
      algorithm: "AES-256-GCM" as const,
    };

    const encrypted = encryptAES256GCM(shareKey, shares[i], aad);

    encryptedShares.push({
      encryptedShare: encrypted.ciphertext,
      shareIv: encrypted.iv,
      shareAuthTag: encrypted.authTag,
      argon2Salt: salt.toString("base64"),
      shareIndex: i + 1,
    });
  }

  return encryptedShares;
}

/**
 * Reconstruct the ExamKEK from 2 trustee passwords and their encrypted shares.
 * ExamKEK should be used immediately and then zeroed from scope.
 *
 * @param shares     Array of exactly 2 { encryptedShare, shareIv, shareAuthTag, argon2Salt }
 * @param passwords  Array of exactly 2 trustee passwords (matching the shares)
 * @param examId     UUID of the exam (for AAD verification)
 */
export async function reconstructKEK(
  shares: Array<EncryptedShare & { trusteeIndex: number }>,
  passwords: string[],
  examId: string
): Promise<Buffer> {
  if (shares.length < 2) {
    throw new Error("At least 2 shares required to reconstruct ExamKEK");
  }

  const rawShares: Buffer[] = [];

  for (let i = 0; i < shares.length; i++) {
    const share = shares[i];
    const salt = Buffer.from(share.argon2Salt, "base64");
    const shareKey = await argon2idDeriveKey(passwords[i], salt);

    const aad = {
      record_id: `${examId}-share-${share.shareIndex}`,
      record_type: "key_share" as const,
      exam_id: examId,
      key_version: 1,
      algorithm: "AES-256-GCM" as const,
    };

    const decrypted = decryptAES256GCM(
      shareKey,
      {
        ciphertext: share.encryptedShare,
        authTag: share.shareAuthTag,
        iv: share.shareIv,
        aad: JSON.stringify(aad),
        algorithm: "AES-256-GCM",
      },
      aad
    );

    rawShares.push(decrypted);
  }

  // Combine shares to reconstruct ExamKEK
  const examKEK: Buffer = sss.combine(rawShares);
  return examKEK;
}

/**
 * Decrypt a single trustee share with their individual passphrase.
 */
export async function decryptSingleShare(
  share: EncryptedShare,
  password: string,
  examId: string
): Promise<Buffer> {
  const salt = Buffer.from(share.argon2Salt, "base64");
  const shareKey = await argon2idDeriveKey(password, salt);
  const aad = {
    record_id: `${examId}-share-${share.shareIndex}`,
    record_type: "key_share" as const,
    exam_id: examId,
    key_version: 1,
    algorithm: "AES-256-GCM" as const,
  };
  return decryptAES256GCM(
    shareKey,
    {
      ciphertext: share.encryptedShare,
      authTag: share.shareAuthTag,
      iv: share.shareIv,
      aad: JSON.stringify(aad),
      algorithm: "AES-256-GCM",
    },
    aad
  );
}

/**
 * Combine 2 or more raw decrypted Shamir shares into the 32-byte ExamKEK.
 */
export function combineRawShares(rawShares: Buffer[]): Buffer {
  return sss.combine(rawShares);
}

/** Generate a fresh random ExamKEK (32 bytes) */
export function generateExamKEK(): Buffer {
  return randomBytes(32);
}
