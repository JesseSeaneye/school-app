// packages/shared/src/schemas/fee.ts
import { z } from "zod";
import { FeeStatusEnum } from "../enums.js";

// ─── Assigning a fee to a student ───
export const AssignFeeInputSchema = z.object({
  studentId: z.string().uuid(),
  name: z.string().min(1).max(100), // e.g., "Tuition"
  amount: z.number().positive(),
  dueDate: z.string().datetime(),
});
export type AssignFeeInput = z.infer<typeof AssignFeeInputSchema>;

// ─── The Student Fee Record ───
export const StudentFeeSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  name: z.string(),
  totalAmount: z.number(),
  amountPaid: z.number(),
  balance: z.number(),
  dueDate: z.string().datetime(),
  status: FeeStatusEnum,
});
export type StudentFee = z.infer<typeof StudentFeeSchema>;

// ─── Recording a Payment ───
export const RecordPaymentInputSchema = z.object({
  studentFeeId: z.string().uuid(),
  amountPaid: z.number().positive(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentInputSchema>;

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  studentFeeId: z.string().uuid(),
  amountPaid: z.number(),
  paymentDate: z.string().datetime(),
  recordedById: z.string().uuid(),
  recordedByName: z.string(),
});
export type Payment = z.infer<typeof PaymentSchema>;
