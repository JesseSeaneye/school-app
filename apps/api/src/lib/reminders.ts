import { prisma } from "./prisma.js";

export interface ReminderInfo {
  parentName: string;
  parentPhone: string;
  studentName: string;
  studentCode: string;
  balance: number;
}

export async function getFeeReminders(): Promise<ReminderInfo[]> {
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE", parentId: { not: null } },
    include: {
      parent: true,
      fees: { include: { payments: true } },
    },
  });

  const reminders: ReminderInfo[] = [];
  for (const s of students) {
    if (!s.parent?.phone) continue;
    const owed = s.fees.reduce((sum, f) => sum + Number(f.totalAmount), 0);
    const paid = s.fees.reduce(
      (sum, f) =>
        sum + f.payments.reduce((p, pay) => p + Number(pay.amountPaid), 0),
      0
    );
    const balance = owed - paid;
    if (balance > 0) {
      reminders.push({
        parentName: s.parent.fullName,
        parentPhone: s.parent.phone,
        studentName: `${s.firstName} ${s.lastName}`,
        studentCode: s.studentCode,
        balance,
      });
    }
  }
  return reminders;
}