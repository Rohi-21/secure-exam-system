/**
 * Envelope encryption — DEK management under ExamKEK
 *
 * Pattern: AES-256-GCM(ExamKEK, DEK) wraps a per-asset DEK.
 * The ExamKEK is in memory only during reconstruction ceremony or delivery.
 * The DEK is in memory only during the specific encrypt/decrypt operation.
 *
 * Key lifecycle:
 *   ExamKEK: reconstructed from Shamir or RSA-unwrapped → used → discarded
 *   DEK: generated per asset → used → stored only in wrapped form
 */

import { encryptAES256GCM, decryptAES256GCM, generateDEK, EncryptionAAD } from "./aes";

export interface WrappedDEK {
  wrappedDEK: string;    // base64 — AES-GCM(ExamKEK, raw_DEK)
  dekIv: string;         // base64
  dekAuthTag: string;    // base64
}

/**
 * Wrap a DEK under the ExamKEK using AES-256-GCM.
 * @param examKEK  32-byte ExamKEK (in memory during this call only)
 * @param dek      32-byte DEK to wrap
 * @param examId   For AAD binding
 * @param recordId For AAD binding (the asset this DEK belongs to)
 * @param recordType For AAD binding
 */
export function wrapDEK(
  examKEK: Buffer,
  dek: Buffer,
  examId: string,
  recordId: string,
  recordType: EncryptionAAD["record_type"]
): WrappedDEK {
  const aad: EncryptionAAD = {
    record_id: `dek-${recordId}`,
    record_type: recordType,
    exam_id: examId,
    key_version: 1,
    algorithm: "AES-256-GCM",
  };

  const encrypted = encryptAES256GCM(examKEK, dek, aad);
  return {
    wrappedDEK: encrypted.ciphertext,
    dekIv: encrypted.iv,
    dekAuthTag: encrypted.authTag,
  };
}

/**
 * Unwrap a DEK from the ExamKEK.
 * @param examKEK   32-byte ExamKEK
 * @param wrapped   WrappedDEK from wrapDEK
 * @param examId, recordId, recordType — must match what was used during wrapping
 */
export function unwrapDEK(
  examKEK: Buffer,
  wrapped: WrappedDEK,
  examId: string,
  recordId: string,
  recordType: EncryptionAAD["record_type"]
): Buffer {
  const aad: EncryptionAAD = {
    record_id: `dek-${recordId}`,
    record_type: recordType,
    exam_id: examId,
    key_version: 1,
    algorithm: "AES-256-GCM",
  };

  return decryptAES256GCM(
    examKEK,
    {
      ciphertext: wrapped.wrappedDEK,
      authTag: wrapped.dekAuthTag,
      iv: wrapped.dekIv,
      aad: JSON.stringify(aad),
      algorithm: "AES-256-GCM",
    },
    aad
  );
}

/**
 * Full envelope: generate a fresh DEK, encrypt the asset, wrap the DEK.
 * Returns everything needed to store in the database.
 */
export function envelopeEncrypt(
  examKEK: Buffer,
  plaintext: string | Buffer,
  assetAAD: EncryptionAAD,
  examId: string
): {
  ciphertext: string;
  authTag: string;
  iv: string;
  aad: string;
  wrappedDEK: string;
  dekIv: string;
  dekAuthTag: string;
  algorithm: "AES-256-GCM";
  keyVersion: number;
} {
  const dek = generateDEK();
  const encrypted = encryptAES256GCM(dek, plaintext, assetAAD);
  const wrapped = wrapDEK(examKEK, dek, examId, assetAAD.record_id, assetAAD.record_type);

  // dek goes out of scope here
  return {
    ...encrypted,
    ...wrapped,
    keyVersion: assetAAD.key_version,
  };
}

/**
 * Full envelope: unwrap DEK then decrypt asset.
 */
export function envelopeDecrypt(
  examKEK: Buffer,
  stored: {
    ciphertext: string;
    authTag: string;
    iv: string;
    aad: string;
    wrappedDEK: string;
    dekIv: string;
    dekAuthTag: string;
  },
  assetAAD: EncryptionAAD,
  examId: string
): Buffer {
  const wrapped: WrappedDEK = {
    wrappedDEK: stored.wrappedDEK,
    dekIv: stored.dekIv,
    dekAuthTag: stored.dekAuthTag,
  };

  const dek = unwrapDEK(examKEK, wrapped, examId, assetAAD.record_id, assetAAD.record_type);

  return decryptAES256GCM(
    dek,
    {
      ciphertext: stored.ciphertext,
      authTag: stored.authTag,
      iv: stored.iv,
      aad: stored.aad,
      algorithm: "AES-256-GCM",
    },
    assetAAD
  );
}
