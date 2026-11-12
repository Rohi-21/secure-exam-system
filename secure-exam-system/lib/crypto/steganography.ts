/**
 * Steganography module
 * Two techniques:
 *   1. Unicode Zero-Width Character (ZWC) watermarking — embed data in HTML text
 *   2. LSB (Least Significant Bit) image watermarking (placeholder — needs sharp)
 *
 * Purpose: Forensic watermarking to identify the source of leaked question papers.
 * Each student's question text gets a unique invisible watermark derived from
 * { examId, studentId, questionNo }.
 *
 * ZWC technique: encodes a binary string as invisible zero-width characters
 * inserted after the first character of each word.
 *   0 → U+200B (ZERO WIDTH SPACE)
 *   1 → U+200C (ZERO WIDTH NON-JOINER)
 * Delimiter: U+200D (ZERO WIDTH JOINER)
 */

import { sha256Hex } from "./hash";

const ZWS = "\u200B";  // 0 bit
const ZWNJ = "\u200C"; // 1 bit
const ZWJ = "\u200D";  // delimiter between bytes

/**
 * Encode a string as a ZWC bit sequence.
 */
function encodeZWC(data: string): string {
  return Array.from(Buffer.from(data, "utf-8"))
    .map((byte) =>
      Array.from({ length: 8 }, (_, i) => ((byte >> (7 - i)) & 1 ? ZWNJ : ZWS)).join("")
    )
    .join(ZWJ);
}

/**
 * Decode a ZWC bit sequence back to a string.
 */
export function decodeZWC(text: string): string | null {
  try {
    const bytes = text.split(ZWJ).map((byteStr) => {
      let val = 0;
      for (const ch of byteStr) {
        val = (val << 1) | (ch === ZWNJ ? 1 : 0);
      }
      return val;
    });
    return Buffer.from(bytes).toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Embed a ZWC watermark derived from { examId, questionNo } into question text.
 * The watermark is a 6-char hex prefix of SHA-256(examId:questionNo) — short enough
 * to not bloat the text, long enough to identify the exam.
 *
 * @param text        Original question text
 * @param identifier  String to encode, e.g. "examId:questionNo"
 * @returns Text with invisible ZWC watermark inserted after first word
 */
export function embedZWCWatermark(text: string, identifier: string): string {
  // Use first 6 hex chars of SHA-256(identifier) as the watermark payload
  const watermark = sha256Hex(Buffer.from(identifier, "utf-8")).slice(0, 12);
  const encoded = encodeZWC(watermark);

  // Insert after the first space (after first word)
  const firstSpace = text.indexOf(" ");
  if (firstSpace === -1) {
    return text + encoded; // No space — append at end
  }
  return text.slice(0, firstSpace + 1) + encoded + text.slice(firstSpace + 1);
}

/**
 * Extract and return the watermark from text if present.
 * Returns the decoded identifier or null if no watermark found.
 */
export function extractZWCWatermark(text: string): string | null {
  // Find the ZWC block between first word and second word
  const zwcPattern = new RegExp(`[${ZWS}${ZWNJ}${ZWJ}]+`);
  const match = text.match(zwcPattern);
  if (!match) return null;
  return decodeZWC(match[0]);
}

/**
 * Per-student watermarking: derive a unique mark per student.
 * Used when delivering questions: embed student identity into their copy.
 * @param text       Question text (may already have exam-level watermark)
 * @param examId     Exam UUID
 * @param studentId  Student UUID
 * @param questionNo Question number
 */
export function embedStudentWatermark(
  text: string,
  examId: string,
  studentId: string,
  questionNo: number
): string {
  const identifier = `${examId}:${studentId}:${questionNo}`;
  const watermark = sha256Hex(Buffer.from(identifier, "utf-8")).slice(0, 16);
  const encoded = encodeZWC(watermark);

  // Insert at a different position — after second word to avoid collision with exam watermark
  const words = text.split(" ");
  if (words.length < 2) return text + encoded;
  words[1] = words[1] + encoded;
  return words.join(" ");
}
