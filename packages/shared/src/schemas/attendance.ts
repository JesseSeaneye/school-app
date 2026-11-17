// packages/shared/src/schemas/attendance.ts
import { z } from "zod";

export const MarkAttendanceInputSchema = z.object({
  studentId: z.string().uuid(),
  date: z.string().datetime(),
  present: z.boolean(),
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceInputSchema>;

export const AttendanceSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  date: z.string().datetime(),
  present: z.boolean(),
});
export type Attendance = z.infer<typeof AttendanceSchema>;
