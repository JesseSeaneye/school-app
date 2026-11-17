import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { getFeeReminders } from "../lib/reminders.js";

export const remindersRouter = Router();
remindersRouter.use(authenticate);

remindersRouter.get("/fees", requireRole("OWNER", "TEACHER", "SECRETARY"), async (_req, res) => {
  const reminders = await getFeeReminders();

  const withWhatsApp = reminders.map((r) => {
    const digits = r.parentPhone.replace(/\D/g, "");
    const message = encodeURIComponent(
      `Hello ${r.parentName}, ${r.studentName} (${r.studentCode}) has an outstanding balance of ${r.balance.toFixed(2)}. Please contact the school. Thank you.`
    );
    return {
      ...r,
      whatsappUrl: `https://wa.me/${digits}?text=${message}`,
    };
  });

  res.json(withWhatsApp);
});