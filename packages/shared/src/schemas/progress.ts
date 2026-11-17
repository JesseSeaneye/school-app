// packages/shared/src/schemas/progress.ts
import { z } from "zod";

export const CreateProgressInputSchema = z.object({
  studentId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  notes: z.string().min(1).max(2000),
  recommendation: z.string().max(2000).optional(),
});
export type CreateProgressInput = z.infer<typeof CreateProgressInputSchema>;

export const ProgressRecordSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  date: z.string().datetime(),
  rating: z.number().int(),
  notes: z.string(),
  recommendation: z.string().nullable(),
});
export type ProgressRecord = z.infer<typeof ProgressRecordSchema>;
