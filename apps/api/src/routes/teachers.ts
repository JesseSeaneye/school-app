import { Router, type Request } from "express";
import { z } from "zod";
import {
  CreateTeacherInputSchema,
  type User,
} from "@school/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";

export const teachersRouter = Router();

type AuthenticatedRequest = Request & {
  user: { sub: string; role: string };
};
const authenticatedUser = (req: Request) =>
  (req as unknown as AuthenticatedRequest).user;

teachersRouter.use(authenticate);
teachersRouter.use(requireRole("OWNER", "SECRETARY"));

// ─────────────────────────────────────────────────────────────
// ADD TEACHER or SECRETARY  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
teachersRouter.post(
  "/",
  validateBody(CreateTeacherInputSchema),
  async (req, res) => {
    const { fullName, email, phone, password, role, subjects } = req.body;

    if (role === "SECRETARY" && authenticatedUser(req).role !== "OWNER") {
      res.status(403).json({ error: "Only the owner can add a secretary" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email (username) already in use" });
      return;
    }

    if (phone) {
      const phoneTaken = await prisma.user.findUnique({ where: { phone } });
      if (phoneTaken) {
        res.status(409).json({ error: "Phone number already in use" });
        return;
      }
    }

    const passwordHash = await hashPassword(password);

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        role: role === "SECRETARY" ? "SECRETARY" : "TEACHER",
        fullName,
        email,
        phone: phone ?? null,
        passwordHash,
        subjects: subjects ?? null,
      },
    });

    await logAudit({
      userId: authenticatedUser(req).sub,
      action: "CREATE",
      entity: "User",
      entityId: newUser.id,
    });

    const response: User = {
      id: newUser.id,
      role: newUser.role,
      fullName: newUser.fullName,
      email: newUser.email,
      phone: newUser.phone,
      subjects: newUser.subjects,
      createdAt: newUser.createdAt.toISOString(),
    };

    res.status(201).json(response);
  }
);

// ─────────────────────────────────────────────────────────────
// LIST ALL STAFF (Teachers + Secretaries)  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
teachersRouter.get("/", async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { 
      role: { in: ["TEACHER", "SECRETARY"] },
      passwordHash: { not: "removed" } // <-- Hides removed staff
    },
    orderBy: { fullName: "asc" },
  });
  res.json(
    staff.map((t) => ({
      id: t.id,
      role: t.role,
      fullName: t.fullName,
      email: t.email,
      phone: t.phone,
      subjects: t.subjects,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

// ─────────────────────────────────────────────────────────────
// UPDATE TEACHER or SECRETARY  —  Owner + Secretary
// ─────────────────────────────────────────────────────────────
const UpdateTeacherInputSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  email: z.string().min(1).optional(), 
  phone: z.string().min(7).max(20).nullable().optional(),
  subjects: z.string().max(200).nullable().optional(),
});
type UpdateTeacherInput = z.infer<typeof UpdateTeacherInputSchema>;

teachersRouter.patch(
  "/:id",
  validateBody(UpdateTeacherInputSchema),
  async (req, res) => {
    const { id } = req.params;
    const updates = req.body as UpdateTeacherInput;
    const user = authenticatedUser(req);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (
      !existing ||
      (existing.role !== "TEACHER" && existing.role !== "SECRETARY")
    ) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    // Only the Owner can edit another Secretary
    if (
      existing.role === "SECRETARY" &&
      user.role === "SECRETARY" &&
      existing.id !== user.sub
    ) {
      res.status(403).json({ error: "Only the owner can edit a secretary" });
      return;
    }

    if (updates.email && updates.email !== existing.email) {
      const clash = await prisma.user.findUnique({
        where: { email: updates.email },
      });
      if (clash) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
    }

    if (updates.phone && updates.phone !== existing.phone) {
      const clash = await prisma.user.findUnique({
        where: { phone: updates.phone },
      });
      if (clash) {
        res.status(409).json({ error: "Phone number already in use" });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updates,
    });

    await logAudit({
      userId: user.sub,
      action: "UPDATE",
      entity: "User",
      entityId: updated.id,
    });

    res.json({
      id: updated.id,
      role: updated.role,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      subjects: updated.subjects,
      createdAt: updated.createdAt.toISOString(),
    });
  }
);

// ─────────────────────────────────────────────────────────────
// REMOVE TEACHER or SECRETARY  —  Owner + Secretary
// Soft delete: clears credentials so they cannot log in again.
// ─────────────────────────────────────────────────────────────
teachersRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const user = authenticatedUser(req);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (
    !existing ||
    (existing.role !== "TEACHER" && existing.role !== "SECRETARY")
  ) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  if (existing.id === user.sub) {
    res.status(400).json({ error: "You cannot remove yourself" });
    return;
  }

  // Only the Owner can remove another Secretary
  if (user.role === "SECRETARY" && existing.role === "SECRETARY") {
    res.status(403).json({ error: "Only the owner can remove a secretary" });
    return;
  }

     // Soft delete: Keep the record, but clear login credentials
  await prisma.user.update({
    where: { id },
    data: {
      email: null, // Frees up the username for someone else
      phone: null,
      passwordHash: "removed", // Blocks login
      fullName: `${existing.fullName} (Removed)`,
    },
  });
  res.json({ success: true });
});