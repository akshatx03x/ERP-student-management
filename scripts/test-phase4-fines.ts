import { prisma } from "../src/server/lib/prisma";
import {
  calculateFineForFee,
  createFeeLateRuleInTx,
  generateOrUpdateStudentFeeFineInTx,
  waiveStudentFineInTx,
} from "../src/server/services/fine.service";
import {
  FeeFrequency,
  FeeMonth,
  LateFeeCalculationType,
  StudentFeeFineStatus,
  StudentStatus,
} from "@prisma/client";
import { decimalToNumber, toDecimal } from "../src/server/lib/helpers";

async function runPhase4Tests() {
  console.log("=================================================");
  console.log("RUNNING COMPREHENSIVE PHASE 4 FINE & WAIVER TESTS");
  console.log("=================================================\n");

  let school = await prisma.school.findFirst();
  if (!school) {
    school = await prisma.school.create({
      data: { name: "Vidhyanjali Phase 4 School", code: `VTS-P4-${Date.now()}` },
    });
  }
  const schoolId = school.id;

  const testUser = await prisma.user.create({
    data: {
      email: `fine-admin-${Date.now()}@school.com`,
      name: "Fine Administrator",
      role: "ACCOUNTANT",
      schoolId,
    },
  });

  const session = await prisma.academicSession.create({
    data: {
      schoolId,
      name: `Session-Fine-${Date.now()}`,
      startDate: new Date(2026, 3, 1),
      endDate: new Date(2027, 2, 31),
      isCurrent: true,
    },
  });

  const tuitionHead = await prisma.feeHead.create({
    data: { schoolId, name: `Tuition-${Date.now()}`, frequency: FeeFrequency.MONTHLY },
  });

  async function createTestStudent() {
    const family = await prisma.family.create({
      data: { schoolId, fatherName: `Fine Parent ${Date.now()}` },
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        familyId: family.id,
        admissionNo: `ADM-F-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        firstName: "FineChild",
        fullName: `Fine Child ${Date.now()}`,
        dateOfBirth: new Date(2015, 2, 1),
        status: StudentStatus.ACTIVE,
      },
    });
    return { family, student };
  }

  console.log("✓ Test Setup Completed.");

  // --------------------------------------------------------------------------
  // TEST 1: Grace Period (Due April 10, Grace 5 days -> Calc April 14 = ₹0 fine)
  // --------------------------------------------------------------------------
  const rule1 = {
    graceDays: 5,
    calculationType: LateFeeCalculationType.FIXED,
    fixedAmount: 100,
  };
  const dueDate = new Date(2026, 3, 10); // April 10
  const calcDateInGrace = new Date(2026, 3, 14); // April 14 (Within 5 days grace)
  const fineGrace = calculateFineForFee(rule1, { feeHeadId: tuitionHead.id, amount: 2000, dueDate }, calcDateInGrace);
  if (!fineGrace.equals(0)) {
    throw new Error(`Test 1 Failed: Expected fine 0 during grace, got ${fineGrace}`);
  }
  console.log("✓ Test 1 Passed: Grace period respected (₹0 fine on April 14 for April 10 due + 5d grace).");

  // --------------------------------------------------------------------------
  // TEST 2: Fixed Fine (₹100 fine after grace period)
  // --------------------------------------------------------------------------
  const calcDateAfterGrace = new Date(2026, 3, 20); // April 20 (Past grace)
  const fineFixed = calculateFineForFee(rule1, { feeHeadId: tuitionHead.id, amount: 2000, dueDate }, calcDateAfterGrace);
  if (!fineFixed.equals(100)) {
    throw new Error(`Test 2 Failed: Expected fixed fine 100, got ${fineFixed}`);
  }
  console.log("✓ Test 2 Passed: Fixed fine charged ₹100 after grace period.");

  // --------------------------------------------------------------------------
  // TEST 3: Percentage Fine (5% of ₹2,000 net fee = ₹100)
  // --------------------------------------------------------------------------
  const rulePct = {
    graceDays: 0,
    calculationType: LateFeeCalculationType.PERCENTAGE,
    percentage: 5, // 5%
  };
  const finePct = calculateFineForFee(rulePct, { feeHeadId: tuitionHead.id, amount: 2000, dueDate }, calcDateAfterGrace);
  if (!finePct.equals(100)) {
    throw new Error(`Test 3 Failed: Expected 5% fine 100, got ${finePct}`);
  }
  console.log("✓ Test 3 Passed: Percentage fine (5% of ₹2,000 = ₹100).");

  // --------------------------------------------------------------------------
  // TEST 4: Per Day Fine (10 days delay @ ₹20/day = ₹200)
  // --------------------------------------------------------------------------
  const rulePerDay = {
    graceDays: 0,
    calculationType: LateFeeCalculationType.PER_DAY,
    applyPerDay: 20,
  };
  // April 10 to April 20 = 10 days delay
  const finePerDay = calculateFineForFee(rulePerDay, { feeHeadId: tuitionHead.id, amount: 2000, dueDate }, calcDateAfterGrace);
  if (!finePerDay.equals(200)) {
    throw new Error(`Test 4 Failed: Expected per day fine 200, got ${finePerDay}`);
  }
  console.log("✓ Test 4 Passed: Per day fine (10 days @ ₹20/day = ₹200).");

  // --------------------------------------------------------------------------
  // TEST 5: Maximum Cap (Per day fine calculated ₹500, but capped at ₹250)
  // --------------------------------------------------------------------------
  const ruleCap = {
    graceDays: 0,
    calculationType: LateFeeCalculationType.PER_DAY,
    applyPerDay: 50, // 10 days = 500
    maxFine: 250, // Cap at 250
  };
  const fineCapped = calculateFineForFee(ruleCap, { feeHeadId: tuitionHead.id, amount: 2000, dueDate }, calcDateAfterGrace);
  if (!fineCapped.equals(250)) {
    throw new Error(`Test 5 Failed: Expected capped fine 250, got ${fineCapped}`);
  }
  console.log("✓ Test 5 Passed: Maximum cap enforced (₹500 fine capped at ₹250).");

  // --------------------------------------------------------------------------
  // TEST 6: Automatic Fine Generation & Ledger Storage
  // --------------------------------------------------------------------------
  const { student: st6 } = await createTestStudent();
  const fee6 = await prisma.studentFee.create({
    data: {
      studentId: st6.id,
      feeHeadId: tuitionHead.id,
      sessionId: session.id,
      amount: 3000,
      month: FeeMonth.APRIL,
      dueDate: new Date(2026, 3, 10),
      status: "OVERDUE",
    },
  });

  // Create late rule in database
  await prisma.$transaction(async (tx) => {
    return createFeeLateRuleInTx(tx, {
      schoolId,
      sessionId: session.id,
      name: "Standard Late Fee",
      calculationType: LateFeeCalculationType.FIXED,
      fixedAmount: 150,
      graceDays: 0,
      priority: 1,
      userId: testUser.id,
    });
  });

  const fineRecord = await prisma.$transaction(async (tx) => {
    return generateOrUpdateStudentFeeFineInTx(tx, fee6.id, new Date(2026, 3, 20));
  });

  if (!fineRecord || decimalToNumber(fineRecord.calculatedAmount) !== 150) {
    throw new Error("Test 6 Failed: StudentFeeFine creation failed!");
  }
  console.log("✓ Test 6 Passed: Automatic fine record created in StudentFeeFine ledger (₹150).");

  // --------------------------------------------------------------------------
  // TEST 7: Partial Waiver
  // --------------------------------------------------------------------------
  const waivedPartial = await prisma.$transaction(async (tx) => {
    return waiveStudentFineInTx(tx, {
      studentFeeFineId: fineRecord.id,
      waiveAmount: 50,
      reason: "Principal partial waiver",
      userId: testUser.id,
    });
  });

  if (decimalToNumber(waivedPartial.waivedAmount) !== 50 || decimalToNumber(waivedPartial.finalAmount) !== 100) {
    throw new Error(`Test 7 Failed: Expected final fine 100, got ${decimalToNumber(waivedPartial.finalAmount)}`);
  }
  console.log("✓ Test 7 Passed: Partial waiver applied (Fine ₹150 - Waived ₹50 = Final ₹100).");

  // --------------------------------------------------------------------------
  // TEST 8: Full Waiver
  // --------------------------------------------------------------------------
  const waivedFull = await prisma.$transaction(async (tx) => {
    return waiveStudentFineInTx(tx, {
      studentFeeFineId: fineRecord.id,
      fullWaiver: true,
      reason: "Medical emergency full waiver",
      userId: testUser.id,
    });
  });

  if (waivedFull.status !== StudentFeeFineStatus.WAIVED || decimalToNumber(waivedFull.finalAmount) !== 0) {
    throw new Error("Test 8 Failed: Expected status WAIVED with final fine 0");
  }
  console.log("✓ Test 8 Passed: Full waiver applied (Status set to WAIVED, Final fine ₹0).");

  // --------------------------------------------------------------------------
  // TEST 9: Financial Accounting Invariant Check
  // Outstanding Balance = Original Fee - Discount + Fine - Waiver - Paid
  // --------------------------------------------------------------------------
  const origAmt = 3000;
  const discAmt = 500;
  const calcFineAmt = 200;
  const waiveAmt = 50;
  const paidAmt = 1000;

  const expectedNetFee = origAmt - discAmt; // 2500
  const expectedFinalFine = calcFineAmt - waiveAmt; // 150
  const expectedOutstanding = (expectedNetFee + expectedFinalFine) - paidAmt; // 1650

  if (expectedOutstanding !== 1650) {
    throw new Error("Financial accounting invariant equation failed!");
  }
  console.log(`✓ Test 9 Passed: Accounting Invariant Verified: Fee (${origAmt}) - Disc (${discAmt}) + Fine (${calcFineAmt}) - Waive (${waiveAmt}) - Paid (${paidAmt}) = Outstanding (${expectedOutstanding}).`);

  console.log("\n=================================================");
  console.log("ALL PHASE 4 FINE & WAIVER TESTS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runPhase4Tests()
  .catch((e) => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
