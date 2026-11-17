// packages/shared/src/enums.ts
import { z } from "zod";

export const RoleEnum = z.enum(["OWNER", "SECRETARY", "TEACHER", "PARENT"]);
export type Role = z.infer<typeof RoleEnum>;

export const StudentStatusEnum = z.enum([
  "ACTIVE",
  "GRADUATED",
  "SUSPENDED",
]);
export type StudentStatus = z.infer<typeof StudentStatusEnum>;

export const FeeStatusEnum = z.enum(["UNPAID", "PARTIAL", "PAID"]);
export type FeeStatus = z.infer<typeof FeeStatusEnum>;

