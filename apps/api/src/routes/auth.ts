import { Router, type Request } from "express";
import {
  LoginInputSchema,
  ParentLoginInputSchema,
  type AuthResponse,
} from "@school/shared";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { verifyPassword as verifyPw } from "../lib/password.js";
import { logAudit } from "../lib/audit.js";
import { z } from "zod";

export const authRouter = Router();

type AuthenticatedRequest = Request & { user: { sub: string } };
const getUserId = (req: Request): string =>
  (req as AuthenticatedRequest).user.sub;

// ─── Staff login (Owner + Teacher + Secretary) ──────────────────────────────
authRouter.post("/login", validateBody(LoginInputSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role === "PARENT") {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    fullName: user.fullName,
  });

  const response: AuthResponse = {
    token,
    user: {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      subjects: null,
      createdAt: user.createdAt.toISOString(),
    },
  };

  res.json(response);
});

// ─── Parent login (Student Code + Phone) ────────────────────────
authRouter.post(
  "/parent-login",
  validateBody(ParentLoginInputSchema),
  async (req, res) => {
    const { studentCode, phone } = req.body;

    const student = await prisma.student.findUnique({
      where: { studentCode },
      include: { parent: true },
    });

    if (!student?.parent || student.parent.phone !== phone) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signToken({
      sub: student.parent.id,
      role: "PARENT",
      fullName: student.parent.fullName,
    });

    const response: AuthResponse = {
      token,
      user: {
        id: student.parent.id,
        role: "PARENT",
        fullName: student.parent.fullName,
        email: student.parent.email,
        phone: student.parent.phone,
        subjects: null,
        createdAt: student.parent.createdAt.toISOString(),
      },
    };

    res.json(response);
  }
);

// ─────────────────────────────────────────────────────────────
// CHANGE OWN PASSWORD  —  Any logged-in staff member
// ─────────────────────────────────────────────────────────────
const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

authRouter.patch(
  "/change-password",
  authenticate,
  validateBody(ChangePasswordInputSchema),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body as ChangePasswordInput;

    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.role === "PARENT") {
      res.status(400).json({ error: "Parents do not use passwords" });
      return;
    }

    const valid = await verifyPw(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await logAudit({
      userId: user.id,
      action: "CHANGE_PASSWORD",
      entity: "User",
      entityId: user.id,
    });

    res.json({ success: true });
  }
);

// ─────────────────────────────────────────────────────────────
// GET MY PROFILE  —  Any logged-in staff
// ─────────────────────────────────────────────────────────────
authRouter.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: getUserId(req) },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// UPDATE MY PROFILE  —  Any logged-in staff
// ─────────────────────────────────────────────────────────────
const UpdateMeInputSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  email: z.string().min(1).optional(), // Changed to allow "owner" or "secretary"
  phone: z.string().min(7).max(20).nullable().optional(),
});
type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;

authRouter.patch(
  "/me",
  authenticate,
  validateBody(UpdateMeInputSchema),
  async (req, res) => {
    const updates = req.body as UpdateMeInput;

    if (updates.email) {
      const clash = await prisma.user.findUnique({
        where: { email: updates.email },
      });
      if (clash && clash.id !== getUserId(req)) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
    }
    if (updates.phone) {
      const clash = await prisma.user.findUnique({
        where: { phone: updates.phone },
      });
      if (clash && clash.id !== getUserId(req)) {
        res.status(409).json({ error: "Phone already in use" });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: getUserId(req) },
      data: updates,
    });

    res.json({
      id: updated.id,
      role: updated.role,
      fullName: updated.fullName,
      email: updated.email,
      phone: updated.phone,
      createdAt: updated.createdAt.toISOString(),
    });
  }
);