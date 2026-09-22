import { prisma } from "../src/server/lib/prisma";

async function main() {
  const sessions = await prisma.academicSession.findMany();
  console.log("All Sessions in DB:", sessions);
}

main().catch(console.error).finally(() => prisma.$disconnect());
