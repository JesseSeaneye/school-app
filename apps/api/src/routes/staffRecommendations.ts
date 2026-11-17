import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";

export const staffRecommendationsRouter = Router();
staffRecommendationsRouter.use(authenticate);

const getAuthenticatedUser = (req: unknown) =>
    (req as { user: { sub: string; role: string } }).user;

// ─────────────────────────────────────────────────────────────
// CREATE RECOMMENDATION  —  Teacher, Secretary, Owner
// ─────────────────────────────────────────────────────────────
const CreateInputSchema = z.object({
    message: z.string().min(1).max(2000),
});

staffRecommendationsRouter.post(
    "/",
    requireRole("OWNER", "SECRETARY", "TEACHER"),
    validateBody(CreateInputSchema),
    async (req, res) => {
        const { message } = req.body;
        const user = getAuthenticatedUser(req);

        const rec = await prisma.staffRecommendation.create({
            data: {
                teacherId: user.sub,
                message,
            },
        });

        await logAudit({
            userId: user.sub,
            action: "CREATE",
            entity: "StaffRecommendation",
            entityId: rec.id,
        });

        res.status(201).json(rec);
    }
);

// ─────────────────────────────────────────────────────────────
// LIST RECOMMENDATIONS  —  Owner + Secretary see all, Teachers see their own
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// LIST RECOMMENDATIONS  —  Everyone sees everyone's
// ─────────────────────────────────────────────────────────────
staffRecommendationsRouter.get(
    "/",
    requireRole("OWNER", "SECRETARY", "TEACHER"),
    async (_req, res) => {
        const recs = await prisma.staffRecommendation.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                teacher: { select: { fullName: true, role: true } },
            },
        });

        res.json(
            recs.map((r) => ({
                id: r.id,
                message: r.message,
                status: r.status,
                createdAt: r.createdAt.toISOString(),
                teacherName: r.teacher.fullName,
                teacherRole: r.teacher.role,
            }))
        );
    }
);

// ─────────────────────────────────────────────────────────────
// RESOLVE RECOMMENDATION  —  Owner + Secretary only
// ─────────────────────────────────────────────────────────────
staffRecommendationsRouter.patch(
    "/:id/resolve",
    requireRole("OWNER", "SECRETARY"),
    async (req, res) => {
        const user = getAuthenticatedUser(req);
        const rec = await prisma.staffRecommendation.findUnique({
            where: { id: req.params.id },
        });

        if (!rec) {
            res.status(404).json({ error: "Recommendation not found" });
            return;
        }

        const updated = await prisma.staffRecommendation.update({
            where: { id: rec.id },
            data: { status: "RESOLVED" },
        });

        await logAudit({
            userId: user.sub,
            action: "RESOLVE",
            entity: "StaffRecommendation",
            entityId: updated.id,
        });

        res.json(updated);
    }
);