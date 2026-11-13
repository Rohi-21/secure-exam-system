/**
 * GET /api/exam
 * List examinations for the authenticated user.
 *
 * Students: see available/enrolled exams and their personal submission status.
 * Examiners/Admins/HODs: see all examinations with question counts, submission counts,
 * and key status.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    const role = req.headers.get("x-user-role");

    if (!userId || !role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (role === "student") {
      const exams = await prisma.exam.findMany({
        where: {
          status: { in: ["scheduled", "active", "closed", "finalized"] },
        },
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          durationMins: true,
          status: true,
          questions: {
            select: { id: true },
          },
          submissions: {
            where: { studentId: userId },
            select: { id: true, submittedAt: true },
          },
          enrollments: {
            where: { studentId: userId },
            select: { id: true },
          },
        },
      });

      const formatted = exams.map((ex) => ({
        id: ex.id,
        title: ex.title,
        description: ex.description,
        startTime: ex.startTime,
        endTime: ex.endTime,
        durationMins: ex.durationMins,
        status: ex.status,
        questionCount: ex.questions.length,
        isEnrolled: ex.enrollments.length > 0,
        hasSubmitted: ex.submissions.length > 0,
        submittedAt: ex.submissions[0]?.submittedAt ?? null,
      }));

      return NextResponse.json({ exams: formatted });
    }

    // Staff view: examiner, admin, hod
    const exams = await prisma.exam.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, name: true, usn: true },
        },
        _count: {
          select: {
            questions: true,
            submissions: true,
            results: true,
            keyShares: true,
            enrollments: true,
          },
        },
      },
    });

    const formatted = exams.map((ex) => ({
      id: ex.id,
      title: ex.title,
      description: ex.description,
      startTime: ex.startTime,
      endTime: ex.endTime,
      durationMins: ex.durationMins,
      status: ex.status,
      createdByName: ex.createdBy?.name ?? ex.createdBy?.usn ?? "Examiner",
      createdById: ex.createdById,
      questionCount: ex._count.questions,
      submissionCount: ex._count.submissions,
      resultCount: ex._count.results,
      keyShareCount: ex._count.keyShares,
      enrollmentCount: ex._count.enrollments,
      createdAt: ex.createdAt,
    }));

    return NextResponse.json({ exams: formatted });
  } catch (err) {
    console.error("[exam/list]", err);
    return NextResponse.json({ error: "Failed to list exams" }, { status: 500 });
  }
}
