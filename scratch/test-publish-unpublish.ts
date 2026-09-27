import { prisma } from "../src/server/lib/prisma";
import { publishStudentResult, unpublishStudentResult } from "../src/server/services/result.service";

async function test() {
  const student = await prisma.student.findFirst({
    where: { admissionNo: "123" },
  });
  if (!student) {
    console.log("No student found");
    return;
  }

  const session = await prisma.academicSession.findFirst({
    where: { isCurrent: true },
  });
  if (!session) {
    console.log("No session found");
    return;
  }

  console.log("Testing publish/unpublish for student:", student.fullName);
  // Unpublish
  await unpublishStudentResult(student.id, session.id);
  let res = await prisma.studentTermResult.findUnique({
    where: { studentId_sessionId: { studentId: student.id, sessionId: session.id } },
  });
  console.log("After unpublish status:", res?.status);

  // Publish
  await publishStudentResult(student.id, session.id);
  res = await prisma.studentTermResult.findUnique({
    where: { studentId_sessionId: { studentId: student.id, sessionId: session.id } },
  });
  console.log("After publish status:", res?.status);
}

test()
  .catch((e) => console.error("TEST ERROR:", e.message))
  .finally(() => process.exit(0));
