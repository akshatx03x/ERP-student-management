import { prisma } from "../src/server/lib/prisma";
import { createStudentWithFamily } from "../src/server/services/student.service";
import { Role } from "@prisma/client";

async function main() {
  const users = await prisma.user.findMany({ where: { role: Role.PRINCIPAL } });
  const user = users[0];
  if (!user || !user.schoolId) {
    console.log("No principal found");
    return;
  }
  console.log("Principal:", user.email, "schoolId:", user.schoolId);

  const session = await prisma.academicSession.findFirst({
    where: { schoolId: user.schoolId }
  });

  const cls = await prisma.class.findFirst({
    where: { schoolId: user.schoolId },
    include: { sections: true }
  });

  console.log("Class:", cls?.name, "Section:", cls?.sections[0]?.name);

  const admissionNo = "TEST-IMP-" + Date.now();
  const sampleInput = {
    admissionNo,
    firstName: "Test",
    middleName: null,
    lastName: "Student",
    fullName: "Test Student Import",
    dateOfBirth: "2015-05-12",
    gender: "MALE" as const,
    penId: null,
    category: "GENERAL" as const,
    aadhaar: null,
    fatherName: "Father Test",
    motherName: "Mother Test",
    guardianName: "Parent/Guardian",
    phone: "9876543210",
    secondaryPhone: null,
    email: null,
    address: "123 Test Street",
    resAddressLine1: "123 Test Street",
    resAddressLine2: null,
    resCity: "Delhi",
    resState: "Delhi",
    resPincode: "110001",
    enroll: true,
    sessionId: session?.id || null,
    classId: cls?.id || null,
    sectionId: cls?.sections[0]?.id || null,
    allowDuplicate: true,
    createLogin: true
  };

  try {
    console.log("Testing createStudentWithFamily inside transaction with user...");
    await prisma.$transaction(async (tx) => {
      const student = await createStudentWithFamily(sampleInput as any, tx, user);
      console.log("SUCCESS! Created student:", student.id, student.fullName, student.admissionNo);
    });
  } catch (err: any) {
    console.error("Failed createStudentWithFamily:", err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
