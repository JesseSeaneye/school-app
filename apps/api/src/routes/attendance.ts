import { Router } from "express";
import { z } from "zod";
import {
  MarkAttendanceInputSchema,
  type Attendance,
} from "@school/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";
import { canWriteAboutStudent } from "../lib/classAccess.js";

declare global {
  namespace Express {
    interface Request {
      user?: { sub: string; role: string };
    }
  }
}

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

function normalizeDate(input: string | Date): Date {
  const d = new Date(input);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─────────────────────────────────────────────────────────────
// MARK ONE STUDENT'S ATTENDANCE  —  Teacher + Owner + Secretary
// ─────────────────────────────────────────────────────────────
attendanceRouter.post(
  "/",
  requireRole("OWNER", "TEACHER", "SECRETARY"),
  validateBody(MarkAttendanceInputSchema),
  async (req, res) => {
    const { studentId, present } = req.body;
    const date = normalizeDate(req.body.date);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });

    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    // Check permissions BEFORE saving
    const allowed = await canWriteAboutStudent(
      req.user! as Parameters<typeof canWriteAboutStudent>[0],
      studentId
    );
    if (!allowed) {
      res.status(403).json({ error: "You can only write about students in your class" });
      return;
    }

    const record = await prisma.attendance.upsert({
      where: {
        studentId_date: { studentId, date },
      },
      update: { present },
      create: { studentId, date, present },
    });

    await logAudit({
      userId: req.user!.sub,
      action: "UPSERT",
      entity: "Attendance",
      entityId: record.id,
    });

    const response: Attendance = {
      id: record.id,
      studentId: record.studentId,
      date: record.date.toISOString(),
      present: record.present,
    };

    res.status(201).json(response);
  }
);

// ─────────────────────────────────────────────────────────────
// BULK MARK — the whole class at once  —  Teacher + Owner
// ─────────────────────────────────────────────────────────────
const BulkMarkInputSchema = z.object({
  date: z.string().datetime(),
  entries: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        present: z.boolean(),
      })
    )
    .min(1)
    .max(200),
});
type BulkMarkInput = z.infer<typeof BulkMarkInputSchema>;

attendanceRouter.post(
  "/bulk",
  requireRole("OWNER", "SECRETARY", "TEACHER"),
  validateBody(BulkMarkInputSchema),
  async (req, res) => {
    const { entries } = req.body as BulkMarkInput;
    const date = normalizeDate(req.body.date);
    const user = (req as any).user;

    // If teacher, verify they only mark their own class
    if (user.role === "TEACHER") {
      const myClass = await prisma.classLevel.findFirst({
        where: { teacherId: user.sub },
      });

      if (!myClass) {
        res.status(403).json({ error: "You are not assigned to a class" });
        return;
      }

      const studentIds = entries.map((e) => e.studentId);
      const students = await prisma.student.findMany({
        where: { id: { in: studentIds }, classLevelId: myClass.id },
        select: { id: true }
      });

      if (students.length !== studentIds.length) {
        res.status(403).json({ error: "You can only mark attendance for your own class" });
        return;
      }
    }

    const ids = entries.map((e) => e.studentId);
    const found = await prisma.student.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((s) => s.id));
    const missing = ids.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      res.status(400).json({
        error: "Some students were not found",
        missingStudentIds: missing,
      });
      return;
    }

    const results = await prisma.$transaction(
      entries.map((entry) =>
        prisma.attendance.upsert({
          where: {
            studentId_date: { studentId: entry.studentId, date },
          },
          update: { present: entry.present },
          create: { studentId: entry.studentId, date, present: entry.present },
        })
      )
    );

    await logAudit({
      userId: user.sub,
      action: "BULK_UPSERT",
      entity: "Attendance",
    });

    res.status(201).json({
      date: date.toISOString(),
      marked: results.length,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// GET ATTENDANCE FOR ONE STUDENT
// ─────────────────────────────────────────────────────────────
attendanceRouter.get(
  "/student/:studentId",
  requireRole("OWNER", "SECRETARY", "TEACHER", "PARENT"),
  async (req, res) => {
    const { studentId } = req.params;
    const user = (req as any).user;

    if (user.role === "PARENT") {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { parentId: true },
      });
      if (!student || student.parentId !== user.sub) {
        res.status(403).json({ error: "You can only view your own child" });
        return;
      }
    }

    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const records = await prisma.attendance.findMany({
      where: {
        studentId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: normalizeDate(from) } : {}),
                ...(to ? { lte: normalizeDate(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
      take: 500,
    });

    res.json(
      records.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        date: r.date.toISOString(),
        present: r.present,
      }))
    );
  }
);

// ─────────────────────────────────────────────────────────────
// GET ATTENDANCE RANGE
// ─────────────────────────────────────────────────────────────
attendanceRouter.get(
  "/range",
  requireRole("OWNER", "SECRETARY", "TEACHER"),
  async (req, res) => {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    if (!from || !to) {
      res.status(400).json({ error: "from and to query params required (ISO dates)" });
      return;
    }

    const records = await prisma.attendance.findMany({
      where: {
        date: {
          gte: normalizeDate(from),
          lte: normalizeDate(to),
        },
      },
      include: {
        student: {
          select: { id: true, studentCode: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ date: "asc" }, { student: { firstName: "asc" } }],
    });

    res.json(
      records.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        present: r.present,
        studentId: r.student.id,
        studentCode: r.student.studentCode,
        studentName: `${r.student.firstName} ${r.student.lastName}`,
      }))
    );
  }
);

// ─────────────────────────────────────────────────────────────
// GET TODAY'S CLASS ATTENDANCE  —  The fixed version
// ─────────────────────────────────────────────────────────────
attendanceRouter.get(
  "/day",
  requireRole("OWNER", "SECRETARY", "TEACHER"),
  async (req, res) => {
    try {
      const dateParam = (req.query.date as string | undefined) ?? new Date().toISOString();
      const date = normalizeDate(dateParam);
      const user = (req as any).user;

      let whereClause: any = { status: "ACTIVE" };

      // If TEACHER, filter by their class
      if (user.role === "TEACHER") {
        const myClass = await prisma.classLevel.findFirst({
          where: { teacherId: user.sub },
        });

        if (!myClass) {
          res.json({ date: date.toISOString(), students: [] });
          return;
        }

        whereClause.classLevelId = myClass.id;
      }

      const students = await prisma.student.findMany({
        where: whereClause,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          studentCode: true,
          firstName: true,
          lastName: true,
          attendance: {
            where: { date },
            select: { present: true },
          },
        },
      });

      res.json({
        date: date.toISOString(),
        students: students.map((s) => ({
          id: s.id,
          studentCode: s.studentCode,
          firstName: s.firstName,
          lastName: s.lastName,
          present: s.attendance[0]?.present ?? null,
        })),
      });
    } catch (error) {
      console.error("Error loading attendance day:", error);
      res.status(500).json({ error: "Failed to load attendance" });
    }
  }
);