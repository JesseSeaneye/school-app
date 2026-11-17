import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const classesRouter = Router();
classesRouter.use(authenticate);

// GET all classes (Everyone can see)
classesRouter.get("/", async (_req, res) => {
  const classes = await prisma.classLevel.findMany({
    include: {
      teacher: { select: { id: true, fullName: true } }, // <-- THIS WAS MISSING!
    },
    orderBy: { sortOrder: "asc" },
  });
  res.json(classes);
});

// CREATE a class (Owner + Secretary)
const CreateClassSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number(),
  teacherId: z.string().uuid().optional(),
});

classesRouter.post(
  "/",
  requireRole("OWNER", "SECRETARY"),
  async (req, res) => {
    const parsed = CreateClassSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const cls = await prisma.classLevel.create({
      data: parsed.data as any,
      include: { teacher: { select: { id: true, fullName: true } } }, // Include here too
    });
    res.status(201).json(cls);
  }
);

// ASSIGN a teacher to a class (Owner + Secretary)
classesRouter.patch(
  "/:id/teacher",
  requireRole("OWNER", "SECRETARY"),
  async (req, res) => {
    try {
      const { teacherId } = req.body;
      
      if (teacherId) {
        // Force the teacher to only be assigned to ONE class
        // Remove them from any other class first
        await prisma.classLevel.updateMany({
          where: { teacherId: teacherId },
          data: { teacherId: null },
        });
      }

      const cls = await prisma.classLevel.update({
        where: { id: req.params.id },
        data: { teacherId: teacherId === "" ? null : teacherId },
        include: { teacher: { select: { id: true, fullName: true } } },
      });
      
      res.json(cls);
    } catch (error) {
      console.error("Failed to assign teacher:", error);
      res.status(500).json({ error: "Failed to assign teacher in database" });
    }
  }
);