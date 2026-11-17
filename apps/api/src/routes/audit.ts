import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const auditRouter = Router();
auditRouter.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET AUDIT LOG  —  Owner only
// ─────────────────────────────────────────────────────────────
auditRouter.get("/", requireRole("OWNER"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
    include: {
      user: { select: { fullName: true, role: true } },
    },
  });

  res.json(
    logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      userName: l.user.fullName,
      userRole: l.user.role,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      timestamp: l.timestamp.toISOString(),
    }))
  );
});