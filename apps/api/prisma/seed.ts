import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const owner = await prisma.user.upsert({
    where: { email: "owner@school.test" },
    update: {},
    create: {
      role: "OWNER",
      fullName: "School Owner",
      email: "owner@school.test",
      passwordHash,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@school.test" },
    update: {},
    create: {
      role: "TEACHER",
      fullName: "Test Teacher",
      email: "teacher@school.test",
      passwordHash,
    },
  });

  console.log("✅ Seeded users:");
  console.log(`   Owner:   ${owner.email}  / password123`);
  console.log(`   Teacher: ${teacher.email}  / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());