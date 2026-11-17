import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { studentsRouter } from "./routes/students.js";
import { progressRouter } from "./routes/progress.js";
import { feesRouter } from "./routes/fees.js";
import { attendanceRouter } from "./routes/attendance.js";
import { teachersRouter } from "./routes/teachers.js";
import { remindersRouter } from "./routes/reminder.js";
import { auditRouter } from "./routes/audit.js";
import { promotionsRouter } from "./routes/promotions.js";
import { staffRecommendationsRouter } from "./routes/staffRecommendations.js";
import { classesRouter } from "./routes/classes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/students", studentsRouter);
app.use("/api/progress", progressRouter);
app.use("/api/fees", feesRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/teachers", teachersRouter);
app.use("/api/reminders", remindersRouter);
app.use("/api/audit", auditRouter);
app.use("/api/promotions", promotionsRouter);
app.use("/api/staff-recommendations", staffRecommendationsRouter);
app.use("/api/classes", classesRouter);

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});

export default app;