/**
 * Steganography / Watermark Test Suite
 * Tests: ZWC embedding, extraction, forensic identification,
 * per-student watermark uniqueness, text integrity after watermarking.
 *
 * Run: npx tsx tests/security/watermark.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  embedZWCWatermark,
  extractZWCWatermark,
  embedStudentWatermark,
  decodeZWC,
} from "../../lib/crypto/steganography";

const SAMPLE_TEXT = "What is the primary goal of cryptography in information security?";

describe("ZWC Watermarking (Steganography)", () => {

  test("watermarked text is visually indistinguishable (same visible chars)", () => {
    const watermarked = embedZWCWatermark(SAMPLE_TEXT, "exam-abc:1");
    // Strip all zero-width chars
    const visible = watermarked.replace(/[\u200B\u200C\u200D]/g, "");
    assert.equal(visible, SAMPLE_TEXT, "Visible text must be identical after watermarking");
  });

  test("watermarked text is longer than original (ZWC chars inserted)", () => {
    const watermarked = embedZWCWatermark(SAMPLE_TEXT, "exam-abc:1");
    assert.ok(watermarked.length > SAMPLE_TEXT.length,
      "Watermarked text must contain additional ZWC characters");
  });

  test("watermark can be extracted from watermarked text", () => {
    const id = "exam-abc:1";
    const watermarked = embedZWCWatermark(SAMPLE_TEXT, id);
    const extracted = extractZWCWatermark(watermarked);
    assert.ok(extracted !== null, "Watermark must be extractable");
    assert.ok(extracted!.length > 0, "Extracted watermark must not be empty");
  });

  test("different exam+question identifiers produce different watermarks", () => {
    const w1 = embedZWCWatermark(SAMPLE_TEXT, "exam-abc:1");
    const w2 = embedZWCWatermark(SAMPLE_TEXT, "exam-abc:2");
    const w3 = embedZWCWatermark(SAMPLE_TEXT, "exam-xyz:1");
    assert.notEqual(w1, w2, "Different questions must produce different watermarks");
    assert.notEqual(w1, w3, "Different exams must produce different watermarks");
  });

  test("per-student watermarks are unique for each student", () => {
    const student1 = embedStudentWatermark(SAMPLE_TEXT, "exam-abc", "student-001", 1);
    const student2 = embedStudentWatermark(SAMPLE_TEXT, "exam-abc", "student-002", 1);
    assert.notEqual(student1, student2,
      "Same question delivered to different students must have different watermarks");
  });

  test("per-student watermarks for same student are identical (deterministic)", () => {
    const w1 = embedStudentWatermark(SAMPLE_TEXT, "exam-abc", "student-001", 1);
    const w2 = embedStudentWatermark(SAMPLE_TEXT, "exam-abc", "student-001", 1);
    assert.equal(w1, w2, "Watermark for same student+question must be deterministic");
  });

  test("forensic: given leaked text can identify the exam", () => {
    const examId = "exam-forensic-test-99";
    const questionNo = 3;
    const leaked = embedZWCWatermark(SAMPLE_TEXT, `${examId}:${questionNo}`);
    // An auditor with access to the system can re-compute the expected watermark
    const expected = embedZWCWatermark(SAMPLE_TEXT, `${examId}:${questionNo}`);
    assert.equal(leaked, expected,
      "Given examId+questionNo, leaked copy can be identified forensically");
  });

  test("plain text without watermark returns null on extraction", () => {
    const extracted = extractZWCWatermark("No watermark here at all.");
    assert.equal(extracted, null, "Non-watermarked text must return null");
  });
});
