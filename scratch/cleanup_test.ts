import { prisma } from "../src/server/lib/prisma";

async function main() {
  await prisma.student.deleteMany({
    where: { admissionNo: { startsWith: "TEST-IMP-" } }
  });
  console.log("Cleaned up test students");
}

main().catch(console.error).finally(() => prisma.$disconnect());
