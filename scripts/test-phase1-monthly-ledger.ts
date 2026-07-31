import { prisma } from "../src/server/lib/prisma";
import {
  generateStudentMonthlyLedgerInTx,
  findFeeStructureForClass,
  ALL_FEE_MONTHS,
} from "../src/server/services/fee.service";
import { FeeFrequency, FeeMonth, StudentStatus } from "@prisma/client";

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING PHASE 1 MONTHLY LEDGER INTEGRATION TESTS");
  console.log("=================================================\n");

  let school = await prisma.school.findFirst();
  if (!school) {
    school = await prisma.school.create({
      data: { name: "Vidhyanjali Test School", code: `VTS-${Date.now()}` },
    });
  }
  const schoolId = school.id;

  const testUser = await prisma.user.create({
    data: {
      email: `test-admin-${Date.now()}@school.com`,
      name: "Test Accountant",
      role: "ACCOUNTANT",
      schoolId,
    },
  });
  const userId = testUser.id;

  const sessionName = `TestSession-${Date.now()}`;
  const session = await prisma.academicSession.create({
    data: {
      schoolId,
      name: sessionName,
      startDate: new Date(2026, 3, 1), // April 1, 2026
      endDate: new Date(2027, 2, 31),  // March 31, 2027
      isCurrent: true,
      status: "ACTIVE",
    },
  });

  const class1 = await prisma.class.create({
    data: { schoolId, name: `Class 1-${Date.now()}`, sortOrder: 1 },
  });
  const class2 = await prisma.class.create({
    data: { schoolId, name: `Class 2-${Date.now()}`, sortOrder: 2 },
  });

  const family = await prisma.family.create({
    data: { schoolId, fatherName: "Test Parent" },
  });

  // Create Fee Heads
  const tuitionHead = await prisma.feeHead.create({
    data: { schoolId, name: `Tuition Fee ${Date.now()}`, frequency: FeeFrequency.MONTHLY },
  });
  const annualHead = await prisma.feeHead.create({
    data: { schoolId, name: `Annual Charge ${Date.now()}`, frequency: FeeFrequency.ANNUAL },
  });
  const examHead = await prisma.feeHead.create({
    data: { schoolId, name: `Exam Fee ${Date.now()}`, frequency: FeeFrequency.CUSTOM },
  });

  // Create Fee Structure for Class 1 with relational months
  const struct1 = await prisma.feeStructure.create({
    data: {
      sessionId: session.id,
      classId: class1.id,
      name: "Class 1 Fee Structure",
      items: {
        create: [
          {
            feeHeadId: tuitionHead.id,
            amount: 1500,
            months: {
              create: ALL_FEE_MONTHS.map((m) => ({ month: m })),
            },
          },
          {
            feeHeadId: annualHead.id,
            amount: 2500,
            months: {
              create: [{ month: FeeMonth.APRIL }],
            },
          },
          {
            feeHeadId: examHead.id,
            amount: 500,
            months: {
              create: [{ month: FeeMonth.SEPTEMBER }, { month: FeeMonth.FEBRUARY }],
            },
          },
        ],
      },
    },
  });

  console.log("✓ Test Setup Completed.");

  // Test 1: Full session monthly ledger generation for April admission
  const student1 = await prisma.student.create({
    data: {
      schoolId,
      familyId: family.id,
      admissionNo: `ADM-001-${Date.now()}`,
      firstName: "Rahul",
      fullName: "Rahul Sharma",
      dateOfBirth: new Date(2015, 5, 10),
      admissionDate: new Date(2026, 3, 1), // April 1, 2026
      status: StudentStatus.ACTIVE,
    },
  });

  const res1 = await prisma.$transaction(async (tx) => {
    return generateStudentMonthlyLedgerInTx(tx, {
      schoolId,
      studentId: student1.id,
      sessionId: session.id,
      classId: class1.id,
      userId,
    });
  });

  console.log(`✓ Test 1 Passed: Generated ${res1.generated} fee records for full session student.`);
  // Expected: 12 (Tuition) + 1 (Annual) + 2 (Exam) = 15 records
  if (res1.generated !== 15) {
    throw new Error(`Expected 15 records, got ${res1.generated}`);
  }

  // Check generated month breakdown
  const fees1 = await prisma.studentFee.findMany({
    where: { studentId: student1.id, sessionId: session.id },
  });
  const tuitionFees1 = fees1.filter((f) => f.feeHeadId === tuitionHead.id);
  const annualFees1 = fees1.filter((f) => f.feeHeadId === annualHead.id);
  const examFees1 = fees1.filter((f) => f.feeHeadId === examHead.id);

  if (tuitionFees1.length !== 12) throw new Error("Expected 12 monthly tuition fees");
  if (annualFees1.length !== 1 || annualFees1[0].month !== FeeMonth.APRIL)
    throw new Error("Expected 1 Annual charge in APRIL");
  if (examFees1.length !== 2) throw new Error("Expected 2 Exam fees");

  // Test 2: Idempotency (Duplicate Prevention)
  const res2 = await prisma.$transaction(async (tx) => {
    return generateStudentMonthlyLedgerInTx(tx, {
      schoolId,
      studentId: student1.id,
      sessionId: session.id,
      classId: class1.id,
      userId,
    });
  });

  console.log(`✓ Test 2 Passed: Idempotent re-run generated ${res2.generated} duplicate records.`);
  if (res2.generated !== 0) {
    throw new Error(`Expected 0 new records on re-run, got ${res2.generated}`);
  }

  // Test 3: Admission in Middle of Session (August Admission)
  const studentMid = await prisma.student.create({
    data: {
      schoolId,
      familyId: family.id,
      admissionNo: `ADM-MID-${Date.now()}`,
      firstName: "Priya",
      fullName: "Priya Verma",
      dateOfBirth: new Date(2015, 7, 15),
      admissionDate: new Date(2026, 7, 15), // August 15, 2026
      status: StudentStatus.ACTIVE,
    },
  });

  const resMid = await prisma.$transaction(async (tx) => {
    return generateStudentMonthlyLedgerInTx(tx, {
      schoolId,
      studentId: studentMid.id,
      sessionId: session.id,
      classId: class1.id,
      userId,
    });
  });

  console.log(`✓ Test 3 Passed: August admission generated ${resMid.generated} records.`);
  // August to March = 8 months of Tuition.
  // Annual charge is April (skipped for August admission).
  // Exam fees: Sept (kept) and Feb (kept) = 2. Total = 8 + 2 = 10.
  const feesMid = await prisma.studentFee.findMany({
    where: { studentId: studentMid.id, sessionId: session.id },
  });
  const midMonths = feesMid.map((f) => f.month);
  if (midMonths.includes(FeeMonth.APRIL) || midMonths.includes(FeeMonth.JULY)) {
    throw new Error("Mid-session admission generated April/July fees unexpectedly");
  }

  // Test 4: Empty Fee Structure
  const studentClass2 = await prisma.student.create({
    data: {
      schoolId,
      familyId: family.id,
      admissionNo: `ADM-C2-${Date.now()}`,
      firstName: "Aman",
      fullName: "Aman Gupta",
      dateOfBirth: new Date(2015, 2, 2),
      status: StudentStatus.ACTIVE,
    },
  });

  const resEmpty = await prisma.$transaction(async (tx) => {
    return generateStudentMonthlyLedgerInTx(tx, {
      schoolId,
      studentId: studentClass2.id,
      sessionId: session.id,
      classId: class2.id,
      userId,
      requireStructure: false,
    });
  });

  console.log(`✓ Test 4 Passed: Empty fee structure generated ${resEmpty.generated} records.`);
  if (resEmpty.generated !== 0) throw new Error("Expected 0 records for empty structure");

  // Test 5: Rejection of Inactive/Archived Students
  const leftStudent = await prisma.student.create({
    data: {
      schoolId,
      familyId: family.id,
      admissionNo: `ADM-LEFT-${Date.now()}`,
      firstName: "Inactive",
      fullName: "Inactive Student",
      dateOfBirth: new Date(2015, 1, 1),
      status: StudentStatus.LEFT,
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      return generateStudentMonthlyLedgerInTx(tx, {
        schoolId,
        studentId: leftStudent.id,
        sessionId: session.id,
        classId: class1.id,
        userId,
      });
    });
    throw new Error("Should have thrown validation error for left student");
  } catch (err: any) {
    if (err.message.includes("Cannot generate fee ledger for left student")) {
      console.log("✓ Test 5 Passed: Inactive student validation rejected generation successfully.");
    } else {
      throw err;
    }
  }

  // Test 6: Transaction Rollback
  try {
    await prisma.$transaction(async (tx) => {
      await tx.studentFee.create({
        data: {
          studentId: studentClass2.id,
          feeHeadId: tuitionHead.id,
          sessionId: session.id,
          amount: 500,
          month: FeeMonth.APRIL,
        },
      });
      throw new Error("FORCE_ROLLBACK");
    });
  } catch (err: any) {
    if (err.message === "FORCE_ROLLBACK") {
      const rollbackFee = await prisma.studentFee.findFirst({
        where: { studentId: studentClass2.id, sessionId: session.id },
      });
      if (rollbackFee === null) {
        console.log("✓ Test 6 Passed: Transaction rollback verified successfully.");
      } else {
        throw new Error("Rollback failed; record persisted!");
      }
    }
  }

  console.log("\n=================================================");
  console.log("ALL PHASE 1 INTEGRATION TESTS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runTests()
  .catch((e) => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
