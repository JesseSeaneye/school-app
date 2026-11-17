// packages/shared/src/schemas/user.ts
import { z } from "zod";
import { RoleEnum } from "../enums.js";

/**
 * What the client sends when logging in.
 */
export const LoginInputSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/**
 * What the client sends when the Owner creates a new teacher.
 */
export const CreateTeacherInputSchema = z.object({
  fullName: z.string().min(1).max(100),
  email: z.string().min(1), // Changed from .email() earlier
  phone: z.string().min(7).max(20).optional(),
  password: z.string().min(8),
  role: z.enum(["TEACHER", "SECRETARY"]).optional(),
  subjects: z.string().max(200).optional(), // <--- ADD THIS
  classLevelId: z.string().uuid().optional(), // <--- ADD THIS (to assign them to a class)
});
export type CreateTeacherInput = z.infer<typeof CreateTeacherInputSchema>;
/**
 * Parent login. Uses the student's unique code + the parent's phone number.
 * This is safer than a password for non-technical parents.
 */
export const ParentLoginInputSchema = z.object({
  studentCode: z
    .string()
    .regex(/^STU-\d{4}-\d{4}$/, "Format: STU-YYYY-NNNN"),
  phone: z.string().min(7).max(20),
});
export type ParentLoginInput = z.infer<typeof ParentLoginInputSchema>;

/**
 * The user object the API returns. Notice it never includes passwordHash.
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  role: RoleEnum,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  subjects: z.string().nullable(), // <--- ADD THIS
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * What the client gets after a successful login.
 */
export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

