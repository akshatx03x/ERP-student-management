import { prisma } from "../src/server/lib/prisma";

async function main() {
  console.log("=== INVESTIGATING STUDENT NIKKU & ALL STUDENTS ===");

  const allStudents = await prisma.student.findMany({
    include: {
      enrollments: {
        include: { class: true, section: true, session: true },
      },
      family: true,
      studentFees: {
        include: { feeHead: true },
      },
    },
  });

  console.log(`Total students in DB: ${allStudents.length}`);

  const nikkuStudents = allStudents.filter((s) =>
    s.fullName.toLowerCase().includes("nikku")
  );

  console.log(`Found ${nikkuStudents.length} student(s) matching 'nikku':`);
  for (const s of nikkuStudents) {
    console.log({
      id: s.id,
      fullName: s.fullName,
      admissionNo: s.admissionNo,
      status: s.status,
      schoolId: s.schoolId,
      familyId: s.familyId,
      enrollmentsCount: s.enrollments.length,
      currentClass: s.enrollments[0]
        ? `${s.enrollments[0].class.name}-${s.enrollments[0].section.name} (Session: ${s.enrollments[0].session.name})`
        : "No Enrollment",
      studentFeesCount: s.studentFees.length,
    });
  }

  console.log("\n--- ALL STUDENTS LIST ---");
  for (const s of allStudents) {
    console.log(
      `- Name: "${s.fullName}", Adm: "${s.admissionNo}", Status: ${s.status}, Class: ${
        s.enrollments[0] ? `${s.enrollments[0].class.name}-${s.enrollments[0].section.name}` : "None"
      }, Fees: ${s.studentFees.length}`
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
