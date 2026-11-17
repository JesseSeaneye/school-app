import { Router, type Request } from "express";
import {
  RecordPaymentInputSchema,
  summarizeFees,
  type StudentFee,
  type Payment,
} from "@school/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";
import { z } from "zod";
import { canWriteAboutStudent } from "../lib/classAccess.js";

export const feesRouter = Router();

const getAuthenticatedUser = (req: Request): {
  sub: string;
  role: "OWNER" | "SECRETARY" | "TEACHER" | "PARENT";
  fullName: string;
} =>
  (req as Request & {
    user: {
      sub: string;
      role: "OWNER" | "SECRETARY" | "TEACHER" | "PARENT";
      fullName: string;
    };
  }).user;

feesRouter.use(authenticate);

// ─────────────────────────────────────────────────────────────
// ASSIGN FEES TO STUDENTS
// ─────────────────────────────────────────────────────────────

// ASSIGN fee to student — Owner + Secretary
const AssignFeeInputSchema = z.object({
  studentId: z.string().uuid(),
  name: z.string().min(1),      
  amount: z.number().positive(), 
  dueDate: z.string().datetime(),
});

feesRouter.post(
  "/assign",
  requireRole("OWNER", "SECRETARY"),
  validateBody(AssignFeeInputSchema),
  async (req, res) => {
    const { studentId, name, amount, dueDate } = req.body;

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const studentFee = await prisma.studentFee.create({
      data: {
        studentId,
        name, // <-- FIXED: Changed from feeStructureId to name
        totalAmount: amount,
        dueDate: new Date(dueDate),
      },
    });

    res.status(201).json(studentFee);
  }
);

// ─────────────────────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────────────────────

// RECORD payment — Owner + Secretary + Teacher
feesRouter.post(
  "/payments",
  requireRole("OWNER", "SECRETARY", "TEACHER"),
  validateBody(RecordPaymentInputSchema),
  async (req, res) => {
    const { studentFeeId, amountPaid } = req.body;

    const studentFee = await prisma.studentFee.findUnique({
      where: { id: studentFeeId },
      include: { payments: true },
    });

    if (!studentFee) {
      res.status(404).json({ error: "Student fee not found" });
      return;
    }

    const allowed = await canWriteAboutStudent(getAuthenticatedUser(req), studentFee.studentId);
    if (!allowed) {
      res.status(403).json({ error: "You can only write about students in your class" });
      return;
    }

    const alreadyPaid = studentFee.payments.reduce(
      (sum, p) => sum + Number(p.amountPaid),
      0
    );
    const total = Number(studentFee.totalAmount);

    if (alreadyPaid + amountPaid > total) {
      res.status(400).json({
        error: "Payment exceeds remaining balance",
        remaining: total - alreadyPaid,
      });
      return;
    }

    const payment = await prisma.payment.create({
      data: {
        studentFeeId,
        amountPaid,
        recordedById: getAuthenticatedUser(req).sub,
      },
      include: {
        recordedBy: { select: { fullName: true } },
      },
    });

    const newTotalPaid = alreadyPaid + amountPaid;
    const newStatus =
      newTotalPaid >= total ? "PAID" : newTotalPaid > 0 ? "PARTIAL" : "UNPAID";

    await prisma.studentFee.update({
      where: { id: studentFeeId },
      data: { status: newStatus },
    });

    await logAudit({
      userId: getAuthenticatedUser(req).sub,
      action: "CREATE",
      entity: "Payment",
      entityId: payment.id,
    });

    const response: Payment = {
      id: payment.id,
      studentFeeId: payment.studentFeeId,
      amountPaid: Number(payment.amountPaid),
      paymentDate: payment.paymentDate.toISOString(),
      recordedById: payment.recordedById,
      recordedByName: payment.recordedBy.fullName,
    };

    res.status(201).json(response);
  }
);

// ─────────────────────────────────────────────────────────────
// FEE SUMMARY FOR A STUDENT
// ─────────────────────────────────────────────────────────────

feesRouter.get(
  "/summary/:studentId",
  requireRole("OWNER", "SECRETARY", "TEACHER", "PARENT"),
  async (req, res) => {
    const { studentId } = req.params;

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

    const studentFees = await prisma.studentFee.findMany({
      where: { studentId },
      include: {
        payments: true,
      },
      orderBy: { dueDate: "asc" },
    });

    const enriched: StudentFee[] = studentFees.map((sf) => {
      const paid = Math.round(
        sf.payments.reduce((sum, p) => sum + Number(p.amountPaid), 0) * 100
      ) / 100;
      const total = Math.round(Number(sf.totalAmount) * 100) / 100;
      return {
        id: sf.id,
        studentId: sf.studentId,
        name: sf.name, 
        totalAmount: total,
        amountPaid: paid,
        balance: total - paid,
        dueDate: sf.dueDate.toISOString(),
        status: sf.status,
      };
    });

    const summary = summarizeFees(studentId, enriched);

    res.json({
      ...summary,
      fees: enriched,
    });
  }
);

// ─────────────────────────────────────────────────────────────
// UPDATE A PAYMENT
// ─────────────────────────────────────────────────────────────
const UpdatePaymentInputSchema = z.object({
  amountPaid: z.number().positive(),
});
type UpdatePaymentInput = z.infer<typeof UpdatePaymentInputSchema>;

feesRouter.patch(
  "/payments/:id",
  requireRole("OWNER", "SECRETARY"),
  validateBody(UpdatePaymentInputSchema),
  async (req, res) => {
    const { amountPaid } = req.body as UpdatePaymentInput;

    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        studentFee: { include: { payments: true } },
      },
    });
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    const otherPayments = payment.studentFee.payments.filter(
      (p) => p.id !== payment.id
    );
    const otherTotal = otherPayments.reduce(
      (sum, p) => sum + Number(p.amountPaid),
      0
    );
    const total = Number(payment.studentFee.totalAmount);

    if (otherTotal + amountPaid > total) {
      res.status(400).json({
        error: "Payment exceeds remaining balance",
        remaining: total - otherTotal,
      });
      return;
    }

    const updated = await prisma.payment.update({
      where: { id: req.params.id },
      data: { amountPaid },
    });

    const newTotalPaid = otherTotal + amountPaid;
    const newStatus =
      newTotalPaid >= total ? "PAID" : newTotalPaid > 0 ? "PARTIAL" : "UNPAID";

    await prisma.studentFee.update({
      where: { id: payment.studentFeeId },
      data: { status: newStatus },
    });

    await logAudit({
      userId: getAuthenticatedUser(req).sub,
      action: "UPDATE",
      entity: "Payment",
      entityId: payment.id,
    });

    res.json({
      id: updated.id,
      studentFeeId: updated.studentFeeId,
      amountPaid: Number(updated.amountPaid),
      paymentDate: updated.paymentDate.toISOString(),
    });
  }
);