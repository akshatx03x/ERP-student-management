import { prisma } from "../src/server/lib/prisma";

async function main() {
  console.log("=== INSPECTING CLASS 1 STUDENTS ===");

  const class1 = await prisma.class.findFirst({
    where: { name: { contains: "1" } },
    include: {
      sections: true,
      enrollments: {
        include: {
          student: {
            include: {
              family: true,
              studentFees: { include: { feeHead: true, allocations: true } },
            },
          },
          section: true,
          session: true,
        },
      },
    },
  });

  if (!class1) {
    console.log("Class 1 not found!");
    return;
  }

  console.log(`Class Found: ${class1.name} (ID: ${class1.id})`);
  console.log(`Enrollments count: ${class1.enrollments.length}`);

  for (const e of class1.enrollments) {
    const s = e.student;
    console.log(`\nStudent: "${s.fullName}" (ID: ${s.id}, Adm: ${s.admissionNo}, Status: ${s.status})`);
    console.log(`Section: ${e.section.name}, Session: ${e.session.name}`);
    console.log(`Family: ${s.family ? `${s.family.fatherName} (${s.family.primaryPhone})` : "NO FAMILY"}`);
    console.log(`Fees count: ${s.studentFees.length}`);

    if (s.studentFees.length === 0) {
      console.log(`⚠️  NO FEES GENERATED FOR ${s.fullName}!`);
    } else {
      const paidFees = s.studentFees.filter((f) => f.status === "PAID" || f.allocations.length > 0);
      console.log(`   - Paid/Allocated fees: ${paidFees.length} / ${s.studentFees.length}`);
    }
  }

  // Also search for any student with "nik" or "niku" or "nikku" in all students
  const nikStudents = await prisma.student.findMany({
    where: {
      fullName: { contains: "nik" },
    },
    include: {
      enrollments: { include: { class: true, section: true } },
      studentFees: true,
    },
  });

  console.log(`\nAll students containing 'nik': ${nikStudents.length}`);
  for (const ns of nikStudents) {
    console.log(`- ${ns.fullName} (Adm: ${ns.admissionNo}, Class: ${ns.enrollments[0]?.class.name ?? "None"})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
