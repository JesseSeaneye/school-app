import { prisma } from "./prisma.js";

interface AuditParams {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
      },
    });
  } catch (err) {
    // Audit failures should never break the main request
    console.error("Audit log failed:", err);
  }
}