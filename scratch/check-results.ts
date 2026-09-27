import { prisma } from "../src/server/lib/prisma";

async function main() {
  const sessions = await prisma.academicSession.findMany();
  console.log("SESSIONS count:", sessions.length);
  for (const s of sessions) {
    console.log(`- ${s.id} | ${s.name} | isCurrent: ${s.isCurrent}`);
  }

  const results = await prisma.studentTermResult.findMany({
    take: 10,
    include: {
      student: { select: { id: true, fullName: true, admissionNo: true } },
    },
  });
  console.log("TERM RESULTS count:", results.length);
  for (const r of results) {
    console.log(`- Student: ${r.student.fullName} (${r.student.admissionNo}) | Session: ${r.sessionId} | Status: ${r.status} | Outcome: ${r.resultOutcome}`);
  }
}

main().finally(() => process.exit(0));
