// packages/shared/src/utils/fees.ts
import type { StudentFee } from "../schemas/fee.js";

export interface FeeSummary {
  studentId: string;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  isFullyPaid: boolean;
  canContinue: boolean;
}

/**
 * Grace threshold — a student whose balance is under this amount
 * is still allowed to continue attending.
 * Change this number later if the school wants a stricter rule.
 */
export const GRACE_THRESHOLD = 100;

/**
 * Rounds a number to two decimal places.
 * Prevents floating-point artifacts like 299.99999999 from appearing
 * when summing decimals.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function summarizeFees(
  studentId: string,
  fees: StudentFee[]
): FeeSummary {
  const studentFees = fees.filter((f) => f.studentId === studentId);

  const totalOwed = round2(
    studentFees.reduce((sum, f) => sum + f.totalAmount, 0)
  );
  const totalPaid = round2(
    studentFees.reduce((sum, f) => sum + f.amountPaid, 0)
  );
  const balance = round2(totalOwed - totalPaid);

  return {
    studentId,
    totalOwed,
    totalPaid,
    balance,
    isFullyPaid: balance <= 0,
    canContinue: balance <= GRACE_THRESHOLD,
  };
}
