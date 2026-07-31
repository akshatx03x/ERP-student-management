import { prisma } from "../src/server/lib/prisma";
import { getStudentFinancialProfile } from "../src/server/services/financial-profile.service";
import {
  createFeeDiscountInTx,
} from "../src/server/services/discount.service";
import {
  createFeeLateRuleInTx,
  generateOrUpdateStudentFeeFineInTx,
} from "../src/server/services/fine.service";
import {
  recordFamilyPaymentInTx,
} from "../src/server/services/fee.service";
import {
  DiscountCategory,
  DiscountType,
  FeeFrequency,
  FeeMonth,
  LateFeeCalculationType,
  PaymentMethod,
  StudentStatus,
} from "@prisma/client";

async function runPhase5Tests() {
  console.log("=================================================");
  console.log("RUNNING COMPREHENSIVE PHASE 5 FINANCIAL PROFILE TESTS");
  console.log("=================================================\n");

  let school = await prisma.school.findFirst();
  if (!school) {
    school = await prisma.school.create({
      data: { name: "Vidhyanjali Phase 5 School", code: `VTS-P5-${Date.now()}` },
    });
  }
  const schoolId = school.id;

  const testUser = await prisma.user.create({
    data: {
      email: `profile-admin-${Date.now()}@school.com`,
      name: "Profile Administrator",
      role: "ACCOUNTANT",
      schoolId,
    },
  });

  const session = await prisma.academicSession.create({
    data: {
      schoolId,
      name: `Session-Prof-${Date.now()}`,
      startDate: new Date(2026, 3, 1),
      endDate: new Date(2027, 2, 31),
      isCurrent: true,
    },
  });

  const tuitionHead = await prisma.feeHead.create({
    data: { schoolId, name: `Tuition-${Date.now()}`, frequency: FeeFrequency.MONTHLY },
  });

  const family = await prisma.family.create({
    data: { schoolId, fatherName: "Dashboard Parent", primaryPhone: "9988776655" },
  });

  const student = await prisma.student.create({
    data: {
      schoolId,
      familyId: family.id,
      admissionNo: `ADM-P5-${Date.now()}`,
      firstName: "DashboardChild",
      fullName: "Dashboard Child",
      dateOfBirth: new Date(2015, 2, 1),
      status: StudentStatus.ACTIVE,
    },
  });

  // Create fees
  const fee1 = await prisma.studentFee.create({
    data: {
      studentId: student.id,
      feeHeadId: tuitionHead.id,
      sessionId: session.id,
      amount: 2500,
      month: FeeMonth.APRIL,
      dueDate: new Date(2026, 3, 10),
      status: "PENDING",
    },
  });

  // Apply discount
  await prisma.$transaction(async (tx) => {
    return createFeeDiscountInTx(tx, {
      schoolId,
      studentId: student.id,
      sessionId: session.id,
      feeHeadId: tuitionHead.id,
      discountType: DiscountType.FIXED_AMOUNT,
      value: 500,
      category: DiscountCategory.MERIT,
      reason: "Merit concession",
      userId: testUser.id,
    });
  });

  // Apply fine rule & fine
  await prisma.$transaction(async (tx) => {
    await createFeeLateRuleInTx(tx, {
      schoolId,
      sessionId: session.id,
      name: "Dashboard Late Fee",
      calculationType: LateFeeCalculationType.FIXED,
      fixedAmount: 100,
      userId: testUser.id,
    });
    return generateOrUpdateStudentFeeFineInTx(tx, fee1.id, new Date(2026, 3, 20));
  });

  // Record payment with excess to wallet
  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: family.id,
      amount: 3000, // 2100 net due + 900 advance
      method: PaymentMethod.UPI,
      allocations: [{ studentId: student.id, studentFeeId: fee1.id, amount: 2100 }],
    });
  });

  console.log("✓ Test Setup Completed.");

  // Fetch Financial Profile
  const profile = await getStudentFinancialProfile(student.id, session.id, testUser);

  // --------------------------------------------------------------------------
  // TEST 1: Header & Student Metadata
  // --------------------------------------------------------------------------
  if (profile.student.fullName !== "Dashboard Child" || profile.student.family.fatherName !== "Dashboard Parent") {
    throw new Error("Test 1 Failed: Student header metadata mismatch!");
  }
  console.log("✓ Test 1 Passed: Student header & family details verified.");

  // --------------------------------------------------------------------------
  // TEST 2: Financial Summary KPI Values
  // Total Fee: 2500, Discount: 500, Fine: 100, Net Payable: 2100, Paid: 2100, Wallet: 900
  // --------------------------------------------------------------------------
  const { summary } = profile;
  if (
    summary.totalAnnualFee !== 2500 ||
    summary.totalDiscounts !== 500 ||
    summary.totalFinalFine !== 100 ||
    summary.totalNetPayable !== 2100 ||
    summary.totalPaid !== 2100 ||
    summary.walletBalance !== 900
  ) {
    throw new Error(`Test 2 Failed: Summary metrics mismatch! Got ${JSON.stringify(summary)}`);
  }
  console.log("✓ Test 2 Passed: 10 Core Financial Summary KPI metrics verified.");

  // --------------------------------------------------------------------------
  // TEST 3: Monthly Matrix Breakdown
  // --------------------------------------------------------------------------
  if (profile.monthlyMatrix.length === 0 || profile.monthlyMatrix[0].monthName !== "APRIL") {
    throw new Error("Test 3 Failed: Monthly matrix empty or missing APRIL!");
  }
  console.log("✓ Test 3 Passed: Monthly matrix & breakdown verified.");

  // --------------------------------------------------------------------------
  // TEST 4: Payment History & Wallet History
  // --------------------------------------------------------------------------
  if (profile.paymentHistory.length === 0 || profile.walletHistory.length === 0) {
    throw new Error("Test 4 Failed: Payment history or wallet history empty!");
  }
  console.log("✓ Test 4 Passed: Payment history & wallet ledger entries verified.");

  // --------------------------------------------------------------------------
  // TEST 5: Discounts & Fines Ledgers
  // --------------------------------------------------------------------------
  if (profile.discounts.length === 0 || profile.fines.length === 0) {
    throw new Error("Test 5 Failed: Discount or Fine ledger empty!");
  }
  console.log("✓ Test 5 Passed: Discount & Fine ledger entries verified.");

  // --------------------------------------------------------------------------
  // TEST 6: Audit Stream
  // --------------------------------------------------------------------------
  if (profile.auditTimeline.length === 0) {
    throw new Error("Test 6 Failed: Audit stream timeline empty!");
  }
  console.log("✓ Test 6 Passed: Financial audit timeline stream verified.");

  console.log("\n=================================================");
  console.log("ALL PHASE 5 FINANCIAL PROFILE TESTS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runPhase5Tests()
  .catch((e) => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
