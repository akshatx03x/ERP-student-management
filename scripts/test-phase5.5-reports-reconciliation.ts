import { prisma } from "../src/server/lib/prisma";
import {
  getCollectionReport,
  getOutstandingAgeingReport,
  getDiscountFineReports,
  getWalletReport,
  generateCashierDailyClosing,
  runFinancialReconciliation,
  runDataIntegrityAudit,
  getPrincipalFinancialDashboard,
  searchFinancialRecords,
} from "../src/server/services/financial-reports.service";
import { createFeeDiscountInTx } from "../src/server/services/discount.service";
import {
  createFeeLateRuleInTx,
  generateOrUpdateStudentFeeFineInTx,
} from "../src/server/services/fine.service";
import { recordFamilyPaymentInTx } from "../src/server/services/fee.service";
import {
  DiscountCategory,
  DiscountType,
  FeeFrequency,
  FeeMonth,
  LateFeeCalculationType,
  PaymentMethod,
  StudentStatus,
} from "@prisma/client";

async function runPhase5_5Tests() {
  console.log("=================================================");
  console.log("RUNNING COMPREHENSIVE PHASE 5.5 REPORTS & RECONCILIATION TESTS");
  console.log("=================================================\n");

  const school = await prisma.school.create({
    data: { name: "Vidhyanjali Phase 5.5 School", code: `VTS-P55-${Date.now()}` },
  });
  const schoolId = school.id;

  const testUser = await prisma.user.create({
    data: {
      email: `reports-admin-${Date.now()}@school.com`,
      name: "Reports Officer",
      role: "ACCOUNTANT",
      schoolId,
    },
  });

  const session = await prisma.academicSession.create({
    data: {
      schoolId,
      name: `Session-Rep-${Date.now()}`,
      startDate: new Date(2026, 3, 1),
      endDate: new Date(2027, 2, 31),
      isCurrent: true,
    },
  });

  const tuitionHead = await prisma.feeHead.create({
    data: { schoolId, name: `TuitionRep-${Date.now()}`, frequency: FeeFrequency.MONTHLY },
  });

  const family = await prisma.family.create({
    data: { schoolId, fatherName: "Reporting Parent", primaryPhone: "9876543210" },
  });

  const student = await prisma.student.create({
    data: {
      schoolId,
      familyId: family.id,
      admissionNo: `ADM-REP-${Date.now()}`,
      firstName: "ReportingChild",
      fullName: "Reporting Child",
      dateOfBirth: new Date(2016, 1, 1),
      status: StudentStatus.ACTIVE,
    },
  });

  // Create fees
  const fee1 = await prisma.studentFee.create({
    data: {
      studentId: student.id,
      feeHeadId: tuitionHead.id,
      sessionId: session.id,
      amount: 4000,
      month: FeeMonth.APRIL,
      dueDate: new Date(2026, 3, 10),
      status: "PENDING",
    },
  });

  // Create discount
  await prisma.$transaction(async (tx) => {
    return createFeeDiscountInTx(tx, {
      schoolId,
      studentId: student.id,
      sessionId: session.id,
      feeHeadId: tuitionHead.id,
      discountType: DiscountType.FIXED_AMOUNT,
      value: 1000,
      category: DiscountCategory.MERIT,
      reason: "Merit award",
      userId: testUser.id,
    });
  });

  // Create fine rule & fine
  await prisma.$transaction(async (tx) => {
    await createFeeLateRuleInTx(tx, {
      schoolId,
      sessionId: session.id,
      name: "Report Fine Rule",
      calculationType: LateFeeCalculationType.FIXED,
      fixedAmount: 200,
      userId: testUser.id,
    });
    return generateOrUpdateStudentFeeFineInTx(tx, fee1.id, new Date(2026, 3, 20));
  });

  // Record payment with excess to wallet
  await prisma.$transaction(
    async (tx) => {
      return recordFamilyPaymentInTx(tx, {
        schoolId,
        userId: testUser.id,
        familyId: family.id,
        amount: 4000, // Net due = 4000 - 1000 + 200 = 3200; Excess 800 to wallet
        method: PaymentMethod.UPI,
        allocations: [{ studentId: student.id, studentFeeId: fee1.id, amount: 3200 }],
      });
    },
    { timeout: 15000 }
  );

  console.log("✓ Test Setup Completed.");

  // --------------------------------------------------------------------------
  // TEST 1: Collection Report
  // --------------------------------------------------------------------------
  const collectionRep = await getCollectionReport({}, testUser);
  if (collectionRep.totalCollected <= 0 || collectionRep.items.length === 0) {
    throw new Error("Test 1 Failed: Collection report returned no data!");
  }
  console.log(`✓ Test 1 Passed: Collection Report verified (${collectionRep.totalCollected} total collected across ${collectionRep.totalRecords} allocations).`);

  // --------------------------------------------------------------------------
  // TEST 2: Outstanding & Ageing Report
  // --------------------------------------------------------------------------
  const ageingRep = await getOutstandingAgeingReport(session.id, testUser);
  if (typeof ageingRep.grandTotalOutstanding !== "number") {
    throw new Error("Test 2 Failed: Ageing report grand total outstanding invalid!");
  }
  console.log("✓ Test 2 Passed: Outstanding & Ageing buckets verified.");

  // --------------------------------------------------------------------------
  // TEST 3: Discount & Fine Reports
  // --------------------------------------------------------------------------
  const discFineRep = await getDiscountFineReports(session.id, testUser);
  if (discFineRep.discounts.items.length === 0 || discFineRep.fines.items.length === 0) {
    throw new Error("Test 3 Failed: Discount or fine reports empty!");
  }
  console.log("✓ Test 3 Passed: Discount & Fine reports verified.");

  // --------------------------------------------------------------------------
  // TEST 4: Wallet Report
  // --------------------------------------------------------------------------
  const walletRep = await getWalletReport(testUser);
  if (walletRep.totalWallets === 0 || walletRep.transactions.length === 0) {
    throw new Error("Test 4 Failed: Wallet report empty!");
  }
  console.log("✓ Test 4 Passed: Wallet ledger report verified.");

  // --------------------------------------------------------------------------
  // TEST 5: Cashier Daily Closing
  // --------------------------------------------------------------------------
  const cashierRep = await generateCashierDailyClosing(new Date(), undefined, testUser);
  if (cashierRep.grossCollected <= 0) {
    throw new Error("Test 5 Failed: Cashier daily closing gross collection 0!");
  }
  console.log(`✓ Test 5 Passed: Cashier Daily Closing verified (Gross ₹${cashierRep.grossCollected}, UPI ₹${cashierRep.upiAmount}).`);

  // --------------------------------------------------------------------------
  // TEST 6: Financial Reconciliation Engine
  // --------------------------------------------------------------------------
  const reconRep = await runFinancialReconciliation(testUser);
  if (reconRep.receiptAllocationDiff > 0.01) {
    throw new Error(`Test 6 Failed: Financial reconciliation detected receipt/allocation mismatch: ${reconRep.receiptAllocationDiff}`);
  }
  console.log("✓ Test 6 Passed: Financial Reconciliation Engine verified (Receipts == Allocations).");

  // --------------------------------------------------------------------------
  // TEST 7: Data Integrity Audit
  // --------------------------------------------------------------------------
  const integrityRep = await runDataIntegrityAudit(testUser);
  if (integrityRep.orphanAllocations > 0) {
    throw new Error("Test 7 Failed: Data integrity audit found orphan allocations!");
  }
  console.log("✓ Test 7 Passed: Data Integrity Auditor verified (0 orphan allocations).");

  // --------------------------------------------------------------------------
  // TEST 8: Principal Dashboard & Global Financial Search
  // --------------------------------------------------------------------------
  const dashRep = await getPrincipalFinancialDashboard(testUser);
  const searchRes = await searchFinancialRecords("Reporting Child", testUser);

  if (dashRep.todayCollection <= 0 || searchRes.students.length === 0) {
    throw new Error("Test 8 Failed: Principal dashboard or search failed!");
  }
  console.log("✓ Test 8 Passed: Principal Dashboard & Global Financial Search verified.");

  console.log("\n=================================================");
  console.log("ALL PHASE 5.5 REPORTS & RECONCILIATION TESTS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runPhase5_5Tests()
  .catch((e) => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
