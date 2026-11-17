// packages/shared/src/schemas/student.ts
import { z } from "zod";
import { StudentStatusEnum } from "../enums.js";

/**
 * Used when the Owner adds a new student.
 * The app auto-generates the studentCode on the server — the client doesn't send it.
 */
export const CreateStudentInputSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  age: z.number().int().min(3).max(15),
  parentName: z.string().min(1).max(100).optional(),
  parentPhone: z.string().min(7).max(20).optional(),
  classLevelId: z.string().uuid().optional(), // <-- ADD THIS
});
export type CreateStudentInput = z.infer<typeof CreateStudentInputSchema>;

/**
 * Used when updating a student.
 * Every field is optional — you only send what changed.
 */
export const UpdateStudentInputSchema = CreateStudentInputSchema.partial().extend({
  status: StudentStatusEnum.optional(),
});
export type UpdateStudentInput = z.infer<typeof UpdateStudentInputSchema>;

/**
 * A student record returned by the API.
 */
export const StudentSchema = z.object({
  id: z.string().uuid(),
  studentCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().int(),
  parentId: z.string().uuid().nullable(),
  enrollmentDate: z.string().datetime(),
  status: StudentStatusEnum,
    classLevelId: z.string().uuid().nullable(),
  classLevelName: z.string().nullable(), 
});
export type Student = z.infer<typeof StudentSchema>;

/**
 * A compact version used in lists (fewer fields = faster).
 */
export const StudentListItemSchema = StudentSchema.pick({
  id: true,
  studentCode: true,
  firstName: true,
  lastName: true,
  age: true,
  status: true,
  classLevelId: true,   // <-- Add this
  classLevelName: true, // <-- Add this
});
export type StudentListItem = z.infer<typeof StudentListItemSchema>;

