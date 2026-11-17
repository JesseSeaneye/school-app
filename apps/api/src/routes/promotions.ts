import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";

export const promotionsRouter = Router();
promotionsRouter.use(authenticate);

const PromotionInputSchema = z.object({
  decisions: z.array(
    z.object({
      studentId: z.string().uuid(),
      action: z.enum(["PROMOTE", "REPEAT", "GRADUATE", "LEAVE"]),
      toClassLevelId: z.string().uuid().optional(),
    })
  ),
});

promotionsRouter.post(
  "/run",
  requireRole("OWNER", "SECRETARY", "TEACHER"),
  validateBody(PromotionInputSchema),
  async (req, res) => {
    const { decisions } = req.body;

    for (const decision of decisions) {
      if (decision.action === "GRADUATE") {
        await prisma.student.update({
          where: { id: decision.studentId },
          data: { status: "GRADUATED" },
        });
      } else if (decision.action === "LEAVE") {
        await prisma.student.update({
          where: { id: decision.studentId },
          data: { status: "SUSPENDED" }, // Or whatever status you use for leaving
        });
      } else if (decision.action === "PROMOTE" && decision.toClassLevelId) {
        await prisma.student.update({
          where: { id: decision.studentId },
          data: { classLevelId: decision.toClassLevelId },
        });
      }
      // If REPEAT, we do nothing — they stay in the same class.
    }

    await logAudit({
      userId: req.user!.sub,
      action: "RUN_PROMOTIONS",
      entity: "System",
    });

    res.json({ success: true, count: decisions.length });
  }
);