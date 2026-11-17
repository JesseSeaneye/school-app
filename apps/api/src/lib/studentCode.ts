import { prisma } from "./prisma.js";

/**
 * Generates the next student code in the format STU-YYYY-NNNN.
 * The counter resets each calendar year.
 */
export async function generateStudentCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `STU-${year}-`;

  // Find the highest-numbered student code for this year
  const last = await prisma.student.findFirst({
    where: { studentCode: { startsWith: prefix } },
    orderBy: { studentCode: "desc" },
    select: { studentCode: true },
  });

  let nextNumber = 1;
  if (last) {
    const lastNumber = parseInt(last.studentCode.slice(prefix.length), 10);
    if (!Number.isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  return `${prefix}${nextNumber.toString().padStart(4, "0")}`;
}