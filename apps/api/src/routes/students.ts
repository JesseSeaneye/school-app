import { Router } from "express";
import {
  CreateStudentInputSchema,
  UpdateStudentInputSchema,
  type Student,
} from "@school/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { generateStudentCode } from "../lib/studentCode.js";
import { logAudit } from "../lib/audit.js";

export const studentsRouter = Router();

studentsRouter.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET MY CHILD  —  Parent only
// ─────────────────────────────────────────────────────────────
studentsRouter.get("/me", requireRole("PARENT"), async (req, res) => {
  const student = await prisma.student.findFirst({
    where: {
      parentId: (req as typeof req & { user: { sub: string } }).user.sub,
    },
    include: { classLevel: { select: { id: true, name: true } } }, // <-- ADDED
  });

  if (!student) {
    res.status(404).json({ error: "No child found for this account" });
    return;
  }

  const response: Student = {
    id: student.id,
    studentCode: student.studentCode,
    firstName: student.firstName,
    lastName: student.lastName,
    age: student.age,
    parentId: student.parentId,
    enrollmentDate: student.enrollmentDate.toISOString(),
    status: student.status,
    classLevelId: student.classLevelId,               // <-- ADDED
    classLevelName: student.classLevel?.name || null, // <-- ADDED
  };

  res.json(response);
});

// ─────────────────────────────────────────────────────────────
// CREATE STUDENT  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
studentsRouter.post(
  "/",
  requireRole("OWNER", "SECRETARY"),
  validateBody(CreateStudentInputSchema),
  async (req, res) => {
    const { firstName, lastName, age, parentName, parentPhone, classLevelId } = req.body;

    const studentCode = await generateStudentCode();

    let parentId: string | null = null;
    if (parentPhone) {
      const existingParent = await prisma.user.findUnique({
        where: { phone: parentPhone },
      });

      if (existingParent && existingParent.role !== "PARENT") {
        res.status(400).json({
          error: "That phone number belongs to a non-parent account",
        });
        return;
      }

      const parent =
        existingParent ??
        (await prisma.user.create({
          data: {
            role: "PARENT",
            fullName: parentName ?? "Parent",
            phone: parentPhone,
            passwordHash: "",
          },
        }));

      parentId = parent.id;
    }

    const student = await prisma.student.create({
      data: {
        studentCode,
        firstName,
        lastName,
        age,
        parentId,
        classLevelId: classLevelId ?? null,
      },
      include: { classLevel: { select: { id: true, name: true } } },
    });

    await logAudit({
      userId: (req as typeof req & { user: { sub: string } }).user.sub,
      action: "CREATE",
      entity: "Student",
      entityId: student.id,
    });

    const response: Student = {
      id: student.id,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      age: student.age,
      parentId: student.parentId,
      enrollmentDate: student.enrollmentDate.toISOString(),
      status: student.status,
      classLevelId: student.classLevelId,
      classLevelName: student.classLevel?.name || null,
    };

    res.status(201).json(response);
  }
);

// ─────────────────────────────────────────────────────────────
// LIST STUDENTS  —  Owner + Teacher
// ─────────────────────────────────────────────────────────────
studentsRouter.get("/", requireRole("OWNER", "TEACHER", "SECRETARY"), async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim();
  const status = req.query.status as string | undefined;

   const students = await prisma.student.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { studentCode: { contains: search, mode: "insensitive" } },
              // ADD THIS LINE:
              { classLevel: { name: { contains: search, mode: "insensitive" } } }, 
            ],
          }
        : {}),
      ...(status
        ? { status: status as "ACTIVE" | "GRADUATED" | "SUSPENDED" }
        : {}),
    },
    include: { classLevel: { select: { id: true, name: true } } },
    orderBy: { enrollmentDate: "desc" },
  });
  res.json(
    students.map((s) => ({
      id: s.id,
      studentCode: s.studentCode,
      firstName: s.firstName,
      lastName: s.lastName,
      age: s.age,
      parentId: s.parentId,
      enrollmentDate: s.enrollmentDate.toISOString(),
      status: s.status,
      classLevelId: s.classLevelId,
      classLevelName: s.classLevel?.name || null,
    }))
  );
});

// ─────────────────────────────────────────────────────────────
// GET ONE STUDENT  —  Owner + Teacher
// ─────────────────────────────────────────────────────────────
studentsRouter.get("/:id", requireRole("OWNER", "TEACHER", "SECRETARY"), async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { classLevel: { select: { id: true, name: true } } },
  });

  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  res.json({
    id: student.id,
    studentCode: student.studentCode,
    firstName: student.firstName,
    lastName: student.lastName,
    age: student.age,
    parentId: student.parentId,
    enrollmentDate: student.enrollmentDate.toISOString(),
    status: student.status,
    classLevelId: student.classLevelId,
    classLevelName: student.classLevel?.name || null,
  });
});

// ─────────────────────────────────────────────────────────────
// GRADUATE A STUDENT  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
studentsRouter.post(
  "/:id/graduate",
  requireRole("OWNER", "SECRETARY"),
  async (req, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: { status: "GRADUATED" },
      include: { classLevel: { select: { id: true, name: true } } },
    });

    await logAudit({
      userId: (req as typeof req & { user: { sub: string } }).user.sub,
      action: "GRADUATE",
      entity: "Student",
      entityId: updated.id,
    });

    res.json({
      id: updated.id,
      studentCode: updated.studentCode,
      firstName: updated.firstName,
      lastName: updated.lastName,
      age: updated.age,
      parentId: updated.parentId,
      enrollmentDate: updated.enrollmentDate.toISOString(),
      status: updated.status,
      classLevelId: updated.classLevelId,
      classLevelName: updated.classLevel?.name || null,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// SUSPEND A STUDENT  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
studentsRouter.post(
  "/:id/suspend",
  requireRole("OWNER", "SECRETARY"),
  async (req, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: { status: "SUSPENDED" },
      include: { classLevel: { select: { id: true, name: true } } },
    });

    await logAudit({
      userId: (req as typeof req & { user: { sub: string } }).user.sub,
      action: "SUSPEND",
      entity: "Student",
      entityId: updated.id,
    });

    res.json({
      id: updated.id,
      studentCode: updated.studentCode,
      firstName: updated.firstName,
      lastName: updated.lastName,
      age: updated.age,
      parentId: updated.parentId,
      enrollmentDate: updated.enrollmentDate.toISOString(),
      status: updated.status,
      classLevelId: updated.classLevelId,
      classLevelName: updated.classLevel?.name || null,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// REACTIVATE A STUDENT  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
studentsRouter.post(
  "/:id/reactivate",
  requireRole("OWNER", "SECRETARY"),
  async (req, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: { status: "ACTIVE" },
      include: { classLevel: { select: { id: true, name: true } } },
    });

    await logAudit({
      userId: (req as typeof req & { user: { sub: string } }).user.sub,
      action: "REACTIVATE",
      entity: "Student",
      entityId: updated.id,
    });

    res.json({
      id: updated.id,
      studentCode: updated.studentCode,
      firstName: updated.firstName,
      lastName: updated.lastName,
      age: updated.age,
      parentId: updated.parentId,
      enrollmentDate: updated.enrollmentDate.toISOString(),
      status: updated.status,
      classLevelId: updated.classLevelId,
      classLevelName: updated.classLevel?.name || null,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// UPDATE STUDENT  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
studentsRouter.patch(
  "/:id",
  requireRole("OWNER", "SECRETARY"),
  validateBody(UpdateStudentInputSchema),
  async (req, res) => {
    const existing = await prisma.student.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const updated = await prisma.student.update({
      where: { id: req.params.id },
      data: req.body,
      include: { classLevel: { select: { id: true, name: true } } },
    });

    await logAudit({
      userId: (req as typeof req & { user: { sub: string } }).user.sub,
      action: "UPDATE",
      entity: "Student",
      entityId: updated.id,
    });

    res.json({
      id: updated.id,
      studentCode: updated.studentCode,
      firstName: updated.firstName,
      lastName: updated.lastName,
      age: updated.age,
      parentId: updated.parentId,
      enrollmentDate: updated.enrollmentDate.toISOString(),
      status: updated.status,
      classLevelId: updated.classLevelId,
      classLevelName: updated.classLevel?.name || null,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// DELETE STUDENT  —  Owner + Secretary only
// ─────────────────────────────────────────────────────────────
studentsRouter.delete(
  "/:id",
  requireRole("OWNER", "SECRETARY"),
  async (req, res) => {
    try {
      const student = await prisma.student.findUnique({
        where: { id: req.params.id },
      });

      if (!student) {
        res.status(404).json({ error: "Student not found" });
        return;
      }

       // Soft delete: Change status to SUSPENDED instead of deleting
  await prisma.student.update({
    where: { id: req.params.id },
    data: { status: "SUSPENDED" }, 
  });
      await logAudit({
        userId: (req as typeof req & { user: { sub: string } }).user.sub,
        action: "DELETE",
        entity: "Student",
        entityId: req.params.id,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete student error:", error);
      res.status(500).json({ error: "Failed to delete student. They might have linked records." });
    }
  }
);