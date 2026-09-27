import { prisma } from "../src/server/lib/prisma";
import { ResultStatus } from "@prisma/client";

async function main() {
  const updated = await prisma.studentTermResult.updateMany({
    where: { status: ResultStatus.COMPLETED },
    data: { status: ResultStatus.PUBLISHED },
  });
  console.log(`Updated ${updated.count} results from COMPLETED to PUBLISHED.`);

  const current = await prisma.studentTermResult.findMany({
    include: {
      student: { select: { fullName: true, admissionNo: true } },
    },
  });
  for (const r of current) {
    console.log(`- ${r.student.fullName} (${r.student.admissionNo}): ${r.status}`);
  }
}

main().finally(() => process.exit(0));
