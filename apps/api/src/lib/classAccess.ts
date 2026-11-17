import type { JwtPayload } from "./jwt.js";
import { prisma } from "./prisma.js";

export async function canWriteAboutStudent(
  user: JwtPayload,
  studentId: string
): Promise<boolean> {
  if (user.role === "OWNER" || user.role === "SECRETARY") return true;
  if (user.role !== "TEACHER") return false;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { classLevel: { select: { teacherId: true } } },
  });

  return student?.classLevel?.teacherId === user.sub;
}