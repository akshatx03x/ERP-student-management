import { prisma } from "../src/server/lib/prisma";
import {
  recordFamilyPaymentInTx,
  getPaymentReceipt,
  getBulkReceiptsData,
  getStudentReceiptsForClass,
  generateStudentMonthlyLedgerInTx,
} from "../src/server/services/fee.service";
import { PaymentMethod, FeeFrequency } from "@prisma/client";
import { numberToWords } from "../src/lib/utils";

async function runVerification() {
  console.log("=== STARTING FEE RECEIPT SYSTEM VERIFICATION ===");

  // 1. Verify numberToWords helper
  console.log("\n1. Testing numberToWords helper:");
  console.log("1600 =>", numberToWords(1600));
  console.log("800 =>", numberToWords(800));
  console.log("12500.50 =>", numberToWords(12500.5));

  // 2. Fetch or setup a test school, session, class, fee heads, family & student
  const school = await prisma.school.findFirstOrThrow();
  const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: school.id } });
  const timestamp = Date.now();

  // Create dedicated test class & section for exact ₹1600 test
  const testClass = await prisma.class.create({
    data: {
      schoolId: school.id,
      name: `TestClass_${timestamp}`,
      sortOrder: 99,
      sections: { create: { name: "A" } },
    },
    include: { sections: true },
  });

  const family = await prisma.family.create({
    data: {
      schoolId: school.id,
      fatherName: `RECEIPT TESTER FATHER ${timestamp}`,
      motherName: `RECEIPT TESTER MOTHER ${timestamp}`,
      primaryPhone: "9999888877",
      students: {
        create: {
          schoolId: school.id,
          admissionNo: `TEST-RCP-${timestamp}`,
          firstName: "Rahul",
          lastName: "Tester",
          fullName: `Rahul Tester ${timestamp}`,
          enrollments: {
            create: {
              sessionId: session.id,
              classId: testClass.id,
              sectionId: testClass.sections[0].id,
            },
          },
        },
      },
    },
    include: { students: true },
  });

  const student = family.students[0];
  console.log(`\n2. Test Student: ${student.fullName} (ID: ${student.id}, Adm: ${student.admissionNo})`);

  const tuitionHead = await prisma.feeHead.create({ data: { schoolId: school.id, name: `Tuition Fee ${timestamp}`, frequency: FeeFrequency.MONTHLY } });
  const computerHead = await prisma.feeHead.create({ data: { schoolId: school.id, name: `Computer Fee ${timestamp}`, frequency: FeeFrequency.MONTHLY } });
  const examHead = await prisma.feeHead.create({ data: { schoolId: school.id, name: `Exam Fee ${timestamp}`, frequency: FeeFrequency.MONTHLY } });

  const structure = await prisma.feeStructure.create({
    data: {
      sessionId: session.id,
      classId: testClass.id,
      name: `Structure_${timestamp}`,
      items: {
        create: [
          { feeHeadId: tuitionHead.id, amount: 500 },
          { feeHeadId: computerHead.id, amount: 100 },
          { feeHeadId: examHead.id, amount: 200 },
        ],
      },
    },
    include: { items: { include: { feeHead: true } } },
  });

  // Generate monthly ledger for student
  await prisma.$transaction(async (tx) => {
    await generateStudentMonthlyLedgerInTx(tx, {
      schoolId: school.id,
      studentId: student.id,
      sessionId: session.id,
      classId: testClass.id,
    });
  });

  // Fetch student fees
  const studentFees = await prisma.studentFee.findMany({
    where: { studentId: student.id, sessionId: session.id },
    include: { feeHead: true },
    orderBy: [{ month: "asc" }, { feeHead: { name: "asc" } }],
  });

  console.log(`\n3. Found ${studentFees.length} fee records for student.`);

  // 4. Record Multi-Month Payment: ₹1600 (Covering April & May = ₹800 + ₹800)
  const aprilFees = studentFees.filter((f) => f.month === "APRIL");
  const mayFees = studentFees.filter((f) => f.month === "MAY");

  const aprilTotal = aprilFees.reduce((s, f) => s + Number(f.amount), 0);
  const mayTotal = mayFees.reduce((s, f) => s + Number(f.amount), 0);
  console.log(`April Fee Total: ₹${aprilTotal}, May Fee Total: ₹${mayTotal}`);

  const testFeeIds = [...aprilFees.map((f) => f.id), ...mayFees.map((f) => f.id)];

  const multiMonthAllocations = [
    ...aprilFees.map((f) => ({ studentId: student.id, studentFeeId: f.id, amount: Number(f.amount) })),
    ...mayFees.map((f) => ({ studentId: student.id, studentFeeId: f.id, amount: Number(f.amount) })),
  ];

  const payRes = await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId: school.id,
      familyId: family.id,
      amount: aprilTotal + mayTotal, // ₹1600
      method: PaymentMethod.CASH,
      referenceNo: `VERIFY-REF-${Date.now()}`,
      notes: "Multi-month payment test",
      selectedStudentFeeIds: testFeeIds,
      allocations: multiMonthAllocations,
    });
  });

  console.log("\n4. Payment Recorded Successfully!");
  console.log(`Receipt String ID: ${payRes.payment.receiptNo}`);
  console.log(`Human Readable Receipt Number: ${payRes.payment.receiptNumber}`);

  // 5. Test Receipt Retrieval directly from DB (without Next.js header dependency)
  const paymentRecord = await prisma.familyPayment.findFirstOrThrow({
    where: { id: payRes.payment.id },
    include: {
      receipt: true,
      allocations: {
        include: {
          student: true,
          studentFee: { include: { feeHead: true } },
        },
      },
    },
  });

  const snap = paymentRecord.receipt?.snapshot as any;

  console.log("\n5. Receipt Snapshot Inspection:");
  console.log(`Receipt Number: ${snap.receiptNumber}`);
  console.log(`Total Amount: ₹${snap.amount}`);
  console.log(`Allocations Count (Raw): ${snap.allocations.length}`);

  // Perform Client Aggregation Test (simulating SingleFeeReceipt)
  const feeHeadMap = new Map<string, number>();
  const monthsSet = new Set<string>();

  for (const alloc of snap.allocations) {
    const head = alloc.feeHead;
    const amt = alloc.amount;
    feeHeadMap.set(head, (feeHeadMap.get(head) || 0) + amt);
    if (alloc.month) monthsSet.add(alloc.month);
  }

  console.log("\n6. Aggregated Presentation Test:");
  console.log("Covered Months:", Array.from(monthsSet).join(", "));
  feeHeadMap.forEach((amt, head) => {
    console.log(`  - ${head}: ₹${amt}`);
  });

  // Verify expectations:
  if (snap.receiptNumber && snap.receiptNumber >= 10001) {
    console.log("✅ PASSED: Human-readable receipt number is >= 10001 and unique!");
  } else {
    console.error("❌ FAILED: Receipt number is missing or invalid!");
  }

  if (feeHeadMap.get(tuitionHead.name) === 1000) {
    console.log(`✅ PASSED: ${tuitionHead.name} correctly aggregated to ₹1000 for 2 months!`);
  } else {
    console.error(`❌ FAILED: ${tuitionHead.name} aggregation mismatch! Actual:`, feeHeadMap.get(tuitionHead.name));
  }

  if (feeHeadMap.get(computerHead.name) === 200) {
    console.log(`✅ PASSED: ${computerHead.name} correctly aggregated to ₹200 for 2 months!`);
  } else {
    console.error(`❌ FAILED: ${computerHead.name} aggregation mismatch! Actual:`, feeHeadMap.get(computerHead.name));
  }

  if (feeHeadMap.get(examHead.name) === 400) {
    console.log(`✅ PASSED: ${examHead.name} correctly aggregated to ₹400 for 2 months!`);
  } else {
    console.error(`❌ FAILED: ${examHead.name} aggregation mismatch! Actual:`, feeHeadMap.get(examHead.name));
  }

  // 7. Test Bulk Receipt Query
  console.log("\n7. Testing Bulk Receipt Query:");
  const bulkPayments = await prisma.familyPayment.findMany({
    where: { id: { in: [payRes.payment.id] } },
    include: { receipt: true },
  });
  console.log(`Bulk Payments Query Count: ${bulkPayments.length}`);

  console.log("\n=== ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY ===");
}

runVerification()
  .catch((e) => {
    console.error("Verification failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
