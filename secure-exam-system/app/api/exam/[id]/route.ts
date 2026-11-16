import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");
    const { id: examId } = await params;

    if (!userId || !role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        createdBy: {
          select: { id: true, name: true, usn: true },
        },
        answerKey: {
          select: {
            commitment: true,
            revealedAt: true,
          },
        },
        keyShares: {
          select: {
            trusteeId: true,
            shareIndex: true,
            trustee: {
              select: { id: true, name: true, usn: true, role: true },
            },
          },
          orderBy: { shareIndex: "asc" },
        },
        _count: {
          select: {
            questions: true,
            submissions: true,
            results: true,
            enrollments: true,
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Role check: Student can only see basic details if enrolled or active
    if (role === "student") {
      const isEnrolled = await prisma.examEnrollment.findFirst({
        where: { examId, studentId: userId },
      });

      return NextResponse.json({
        exam: {
          id: exam.id,
          title: exam.title,
          description: exam.description,
          startTime: exam.startTime,
          endTime: exam.endTime,
          durationMins: exam.durationMins,
          status: exam.status,
          questionCount: exam._count.questions,
          isEnrolled: !!isEnrolled,
        },
      });
    }

    // Staff view: Check if finalized or released
    const sampleSubmission = await prisma.submission.findFirst({
      where: { examId, merkleProof: { not: null } },
      select: { merkleProof: true },
    });

    const sampleResult = await prisma.result.findFirst({
      where: { examId, merkleRoot: { not: null } },
      select: { merkleRoot: true },
    });

    const releasedResultCount = await prisma.result.count({
      where: { examId, releasedAt: { not: null } },
    });

    const isFinalized = !!sampleSubmission?.merkleProof || !!sampleResult?.merkleRoot;
    const merkleRoot = sampleResult?.merkleRoot ?? null;

    return NextResponse.json({
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        startTime: exam.startTime,
        endTime: exam.endTime,
        durationMins: exam.durationMins,
        status: exam.status,
        createdById: exam.createdById,
        createdByName: exam.createdBy?.name ?? exam.createdBy?.usn ?? "Examiner",
        questionCount: exam._count.questions,
        submissionCount: exam._count.submissions,
        resultCount: exam._count.results,
        releasedResultCount,
        enrollmentCount: exam._count.enrollments,
        isAnswerRevealed: !!exam.answerKey?.revealedAt,
        answerCommitment: exam.answerKey?.commitment ?? null,
        merkleRoot,
        isFinalized,
        isReleased: releasedResultCount > 0,
        trustees: exam.keyShares.map((ks) => ({
          trusteeId: ks.trusteeId,
          name: ks.trustee.name || ks.trustee.usn,
          shareIndex: ks.shareIndex,
        })),
        createdAt: exam.createdAt,
      },
    });
  } catch (err) {
    console.error("[exam/details]", err);
    return NextResponse.json({ error: "Failed to fetch exam details" }, { status: 500 });
  }
}
