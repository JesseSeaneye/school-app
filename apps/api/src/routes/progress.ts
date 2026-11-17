import { Router, type Request } from "express";
import {
  CreateProgressInputSchema,
  type ProgressRecord,
} from "@school/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";
import { z } from "zod";
import { canWriteAboutStudent } from "../lib/classAccess.js";

type AuthenticatedUser = Parameters<typeof canWriteAboutStudent>[0];
type AuthenticatedRequest = Request & { user: AuthenticatedUser };

const getAuthenticatedUser = (req: Request): AuthenticatedUser =>
  (req as AuthenticatedRequest).user;

export const progressRouter = Router();

progressRouter.use(authenticate);

// ─────────────────────────────────────────────────────────────
// CREATE PROGRESS RECORD  —  Teacher + Owner + Secretary
// ─────────────────────────────────────────────────────────────
progressRouter.post(
  "/",
  requireRole("OWNER", "SECRETARY", "TEACHER"),
  validateBody(CreateProgressInputSchema),
  async (req, res) => {
    const { studentId, rating, notes, recommendation } = req.body;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });

    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const record = await prisma.progressRecord.create({
      data: {
        studentId,
        teacherId: getAuthenticatedUser(req).sub,
        rating,
        notes,
        recommendation: recommendation ?? null,
      },
      include: {
        teacher: { select: { fullName: true } },
      },
    });

    await logAudit({
      userId: getAuthenticatedUser(req).sub,
      action: "CREATE",
      entity: "ProgressRecord",
      entityId: record.id,
    });

    const response: ProgressRecord = {
      id: record.id,
      studentId: record.studentId,
      teacherId: record.teacherId,
      teacherName: record.teacher.fullName,
      date: record.date.toISOString(),
      rating: record.rating,
      notes: record.notes,
      recommendation: record.recommendation,
    };

    res.status(201).json(response);
  }
);

// ─────────────────────────────────────────────────────────────
// LIST PROGRESS FOR A STUDENT  —  Teacher + Owner + Secretary + Parent
// ─────────────────────────────────────────────────────────────
progressRouter.get(
  "/student/:studentId",
  requireRole("OWNER", "SECRETARY", "TEACHER", "PARENT"),
  async (req, res) => {
    const { studentId } = req.params;

    // If the requester is a PARENT, they can only view their own child
    if (getAuthenticatedUser(req).role === "PARENT") {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { parentId: true },
      });

      if (!student || student.parentId !== getAuthenticatedUser(req).sub) {
        res.status(403).json({ error: "You can only view your own child" });
        return;
      }
    }

    // Only show approved notes to parents
    const whereClause: any = { studentId };
    if (getAuthenticatedUser(req).role === "PARENT") {
      whereClause.showToParent = true;
    }

    const records = await prisma.progressRecord.findMany({
      where: whereClause,
      orderBy: { date: "desc" },
      include: {
        teacher: { select: { fullName: true } },
      },
    });

    res.json(
      records.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        teacherId: r.teacherId,
        teacherName: r.teacher.fullName,
        date: r.date.toISOString(),
        rating: r.rating,
        notes: r.notes,
        recommendation: r.recommendation,
        showToParent: (r as any).showToParent,
      }))
    );
  }
);

// ─────────────────────────────────────────────────────────────
// RECOMMENDATIONS FEED  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
progressRouter.get(
  "/recommendations",
  requireRole("OWNER", "SECRETARY"),
  async (_req, res) => {
    const records = await prisma.progressRecord.findMany({
      where: {
        recommendation: { not: null },
      },
      orderBy: { date: "desc" },
      take: 100,
      include: {
        teacher: { select: { fullName: true } },
        student: { select: { firstName: true, lastName: true, studentCode: true } },
      },
    });

    res.json(
      records.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: `${r.student.firstName} ${r.student.lastName}`,
        studentCode: r.student.studentCode,
        teacherId: r.teacherId,
        teacherName: r.teacher.fullName,
        date: r.date.toISOString(),
        rating: r.rating,
        notes: r.notes,
        recommendation: r.recommendation,
        showToParent: (r as any).showToParent,
      }))
    );
  }
);

// ─────────────────────────────────────────────────────────────
// ADD OWNER COMMENT  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
const CommentInputSchema = z.object({
  comment: z.string().min(1).max(2000),
});
type CommentInput = z.infer<typeof CommentInputSchema>;

progressRouter.post(
  "/:id/comment",
  requireRole("OWNER", "SECRETARY"),
  validateBody(CommentInputSchema),
  async (req, res) => {
    const { comment } = req.body as CommentInput;

    const record = await prisma.progressRecord.findUnique({
      where: { id: req.params.id },
    });
    if (!record) {
      res.status(404).json({ error: "Progress record not found" });
      return;
    }

    const stamped = `[Owner comment ${new Date().toISOString().slice(0, 10)}]: ${comment}`;
    const newRecommendation = record.recommendation
      ? `${record.recommendation}\n\n${stamped}`
      : stamped;

    const updated = await prisma.progressRecord.update({
      where: { id: record.id },
      data: { recommendation: newRecommendation },
      include: { teacher: { select: { fullName: true } } },
    });

    await logAudit({
      userId: getAuthenticatedUser(req).sub,
      action: "COMMENT",
      entity: "ProgressRecord",
      entityId: updated.id,
    });

    res.json({
      id: updated.id,
      studentId: updated.studentId,
      teacherId: updated.teacherId,
      teacherName: updated.teacher.fullName,
      date: updated.date.toISOString(),
      rating: updated.rating,
      notes: updated.notes,
      recommendation: updated.recommendation,
      showToParent: true,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// APPROVE RECOMMENDATION FOR PARENT  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
progressRouter.patch(
  "/:id/show-to-parent",
  requireRole("OWNER", "SECRETARY"),
  async (req, res) => {
    const record = await prisma.progressRecord.findUnique({
      where: { id: req.params.id },
    });

    if (!record) {
      res.status(404).json({ error: "Progress record not found" });
      return;
    }

    const updated = await prisma.progressRecord.update({
      where: { id: record.id },
      data: { showToParent: true } as any,
      include: { teacher: { select: { fullName: true } } },
    });

    await logAudit({
      userId: getAuthenticatedUser(req).sub,
      action: "APPROVE_FOR_PARENT",
      entity: "ProgressRecord",
      entityId: updated.id,
    });

    res.json({
      id: updated.id,
      studentId: updated.studentId,
      teacherId: updated.teacherId,
      teacherName: updated.teacher.fullName,
      date: updated.date.toISOString(),
      rating: updated.rating,
      notes: updated.notes,
      recommendation: updated.recommendation,
      showToParent: true,
    });
  }
);