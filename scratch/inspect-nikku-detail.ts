import { prisma } from "../src/server/lib/prisma";

async function main() {
  console.log("=== DETAILED INSPECTION FOR NIKKU (Adm: 514) ===");

  const nikkuList = await prisma.student.findMany({
    where: {
      fullName: { contains: "NIKKU" },
    },
    include: {
      school: true,
      family: true,
      enrollments: {
        include: { class: true, section: true, session: true },
      },
      studentFees: {
        include: { feeHead: true, allocations: true, session: true },
      },
    },
  });

  console.log(`Found ${nikkuList.length} NIKKU student(s):`);

  for (const s of nikkuList) {
    console.log("\n==================================================");
    console.log(`ID: ${s.id}`);
    console.log(`Full Name: ${s.fullName}`);
    console.log(`Admission No: ${s.admissionNo}`);
    console.log(`Status: ${s.status}`);
    console.log(`School ID: ${s.schoolId} (${s.school.name})`);
    console.log(`Family ID: ${s.familyId}`);
    console.log(`Family Father: ${s.family?.fatherName ?? "NONE"}`);
    console.log(`Enrollments Count: ${s.enrollments.length}`);

    for (const e of s.enrollments) {
      console.log(` - Class: ${e.class.name} (${e.class.id}), Section: ${e.section.name} (${e.section.id}), Session: ${e.session.name} (${e.session.id})`);

      // Check Fee Structure for this Class & Session
      const feeStruct = await prisma.feeStructure.findFirst({
        where: { classId: e.classId, sessionId: e.sessionId },
        include: { items: { include: { feeHead: true } } },
      });
      console.log(`   Fee Structure for ${e.class.name}: ${feeStruct ? `Found (${feeStruct.name}, ${feeStruct.items.length} items)` : "⚠️ NO FEE STRUCTURE DEFINED FOR THIS CLASS!"}`);
    }

    console.log(`Student Fees Count: ${s.studentFees.length}`);
    for (const f of s.studentFees) {
      console.log(` - Fee: ${f.feeHead.name}, Month: ${f.month ?? "Annual"}, Year: ${f.dueYear}, Amount: ${f.amount}, Status: ${f.status}, Allocations: ${f.allocations.length}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
