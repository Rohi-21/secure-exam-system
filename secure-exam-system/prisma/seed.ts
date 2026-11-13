/**
 * Seed script — creates demo data for end-to-end testing and presentation.
 *
 * Creates:
 *   - 1 Admin, 1 Examiner (with RSA key pair), 3 Students (with crypto keys)
 *   - 1 Sample exam with student enrollments
 *
 * Run: npx tsx prisma/seed.ts
 */

import { PrismaClient } from "@prisma/client";
import { generateRSAKeyPair } from "../lib/crypto/rsa";
import { generateEd25519KeyPair } from "../lib/crypto/ed25519";
import { generateECDSAKeyPair } from "../lib/crypto/ecdsa";
import { argon2idHash } from "../lib/crypto/kdf";
import { encryptTOTPSecret } from "../lib/auth/totp";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(".env.local") });

const prisma = new PrismaClient();

const DEMO_PASSWORD = "DemoPassword@CNS2024!";
const DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXP"; // Base32 TOTP secret for authenticator apps

async function main() {
  console.log("\n🌱 Seeding database...\n");

  const encryptedTotp = encryptTOTPSecret(DEMO_TOTP_SECRET);

  // ── 1. Admin ─────────────────────────────────────────────────────────────
  const { publicKeyPem: adminEd25519Pub } = generateEd25519KeyPair();
  const { publicKeyPem: adminEcdsaPub   } = generateECDSAKeyPair();

  const admin = await prisma.user.upsert({
    where: { usn: "ADMIN001" },
    update: {
      totpSecret: encryptedTotp,
    },
    create: {
      usn: "ADMIN001",
      email: "admin@kletech.ac.in",
      name: "System Administrator",
      role: "admin",
      passwordHash: await argon2idHash(DEMO_PASSWORD),
      totpSecret: encryptedTotp,
      ed25519PubKey: adminEd25519Pub,
      ecdsaPubKey:   adminEcdsaPub,
    },
  });
  console.log(`✅ Admin created: ${admin.usn} (${admin.email})`);

  // ── 2. Examiner ───────────────────────────────────────────────────────────
  const { publicKeyPem: examEd25519Pub } = generateEd25519KeyPair();
  const { publicKeyPem: examEcdsaPub   } = generateECDSAKeyPair();
  const { publicKeyPem: examRSAPub, privateKeyPem: examRSAPriv } = generateRSAKeyPair();

  const examiner = await prisma.user.upsert({
    where: { usn: "EX001" },
    update: {},
    create: {
      usn: "EX001",
      email: "examiner@kletech.ac.in",
      name: "Dr. Roopa Badami",
      role: "examiner",
      passwordHash: await argon2idHash(DEMO_PASSWORD),
      totpSecret: encryptedTotp,
      ed25519PubKey: examEd25519Pub,
      ecdsaPubKey:   examEcdsaPub,
    },
  });

  await prisma.examinerKey.upsert({
    where: { examinerId: examiner.id },
    update: {},
    create: { examinerId: examiner.id, rsaPublicKey: examRSAPub },
  });

  console.log(`✅ Examiner created: ${examiner.usn} (${examiner.email})`);
  console.log(`\n   ⚠️  SAVE this RSA private key — it is NOT stored in DB:\n`);
  console.log(examRSAPriv);

  // ── 3. Students ───────────────────────────────────────────────────────────
  const studentData = [
    { usn: "01FE23BCS240", name: "K Rohidas Shenoy", email: "rohidas@kletech.ac.in"  },
    { usn: "01FE23BCS258", name: "Archana K",        email: "archana@kletech.ac.in"  },
    { usn: "01FE23BCS255", name: "Spoorthi L C",     email: "spoorthi@kletech.ac.in" },
  ];

  const students = [];
  for (const s of studentData) {
    const { publicKeyPem: ed25519Pub } = generateEd25519KeyPair();
    const { publicKeyPem: ecdsaPub   } = generateECDSAKeyPair();
    const student = await prisma.user.upsert({
      where: { usn: s.usn },
      update: { totpSecret: encryptedTotp },
      create: {
        usn: s.usn, email: s.email, name: s.name,
        role: "student",
        passwordHash: await argon2idHash(DEMO_PASSWORD),
        totpSecret: encryptedTotp,
        ed25519PubKey: ed25519Pub,
        ecdsaPubKey:   ecdsaPub,
      },
    });
    students.push(student);
    console.log(`✅ Student: ${student.usn} — ${student.name}`);
  }

  // ── 4. Sample Exam ────────────────────────────────────────────────────────
  const now       = new Date();
  const startTime = new Date(now.getTime() + 60  * 60 * 1000);
  const endTime   = new Date(now.getTime() + 3   * 60 * 60 * 1000);

  const exam = await prisma.exam.upsert({
    where: { id: "demo-exam-00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id:          "demo-exam-00000000-0000-0000-0000-000000000001",
      title:       "CNS Mid-Term Examination 2024",
      description: "Cryptography and Network Security — Mid Term | KLE Technological University",
      createdById: examiner.id,
      startTime, endTime,
      durationMins: 90,
      status: "draft",
    },
  });
  console.log(`\n✅ Exam: "${exam.title}"`);
  console.log(`   Start: ${startTime.toLocaleString()} | End: ${endTime.toLocaleString()}`);

  // ── 5. Enroll all students ────────────────────────────────────────────────
  for (const student of students) {
    await prisma.examEnrollment.upsert({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
      update: {},
      create: { examId: exam.id, studentId: student.id },
    });
  }
  console.log(`✅ Enrolled ${students.length} students\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("─".repeat(60));
  console.log("SEED COMPLETE — Demo credentials:");
  console.log(`  Password (all users): ${DEMO_PASSWORD}`);
  console.log(`  Admin USN:    ADMIN001`);
  console.log(`  Examiner USN: EX001`);
  console.log(`  Students:     01FE23BCS240 | 01FE23BCS258 | 01FE23BCS255`);
  console.log(`  Exam ID:      ${exam.id}`);
  console.log("─".repeat(60));
  console.log("\n⚠️  TOTP secrets are placeholder. Use /api/auth/register for real TOTP.\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
