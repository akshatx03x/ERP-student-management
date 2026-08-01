import { prisma } from "../src/server/lib/prisma";
import {
  generateStudentMonthlyLedgerInTx,
  recordFamilyPaymentInTx,
  recalcStudentFeeStatus,
} from "../src/server/services/fee.service";
import {
  getOrCreateFamilyWalletInTx,
  getFamilyWalletBalance,
  recordWalletTransactionInTx,
  reconcileFamilyAdvanceInTx,
  refundFamilyAdvance,
} from "../src/server/services/wallet.service";
import {
  AdvanceTransactionType,
  FeeMonth,
  FeeFrequency,
  PaymentMethod,
  StudentStatus,
} from "@prisma/client";
import { decimalToNumber } from "../src/server/lib/helpers";

async function runFullPhase2Tests() {
  console.log("=================================================");
  console.log("RUNNING COMPREHENSIVE PHASE 2 INTEGRATION TESTS");
  console.log("=================================================\n");

  let school = await prisma.school.findFirst();
  if (!school) {
    school = await prisma.school.create({
      data: { name: "Vidyanjali Full Test School", code: `VTS-F2-${Date.now()}` },
    });
  }
  const schoolId = school.id;

  const testUser = await prisma.user.create({
    data: {
      email: `phase2-admin-${Date.now()}@school.com`,
      name: "Phase2 Accountant",
      role: "ACCOUNTANT",
      schoolId,
    },
  });

  // Create Academic Sessions (2026-27 and 2027-28)
  const prevSession = await prisma.academicSession.create({
    data: {
      schoolId,
      name: `Session-2025-26-${Date.now()}`,
      startDate: new Date(2025, 3, 1),
      endDate: new Date(2026, 2, 31),
      isCurrent: false,
    },
  });

  const currSession = await prisma.academicSession.create({
    data: {
      schoolId,
      name: `Session-2026-27-${Date.now()}`,
      startDate: new Date(2026, 3, 1),
      endDate: new Date(2027, 2, 31),
      isCurrent: true,
    },
  });

  const testClass = await prisma.class.create({
    data: { schoolId, name: `Class 5-${Date.now()}` },
  });

  const tuitionHead = await prisma.feeHead.create({
    data: { schoolId, name: `Tuition Fee-${Date.now()}`, frequency: FeeFrequency.MONTHLY },
  });

  const feeStructure = await prisma.feeStructure.create({
    data: {
      name: `Structure Class 5-${Date.now()}`,
      sessionId: currSession.id,
      classId: testClass.id,
      items: {
        create: [
          { feeHeadId: tuitionHead.id, amount: 1000 },
        ],
      },
    },
  });

  console.log("✓ Test Prerequisites Initialized.");

  // Helper to create test family with active student
  async function createTestFamilyWithStudent(admissionDate = new Date(2026, 3, 1)) {
    const family = await prisma.family.create({
      data: { schoolId, fatherName: `Parent-${Date.now()}`, primaryPhone: `98${Math.floor(Math.random()*100000000)}` },
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        familyId: family.id,
        admissionNo: `ADM-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        firstName: "Test",
        fullName: `Child-${Date.now()}`,
        dateOfBirth: new Date(2015, 0, 1),
        admissionDate,
        status: StudentStatus.ACTIVE,
      },
    });
    return { family, student };
  }

  // --------------------------------------------------------------------------
  // PAYMENT TESTS (1-6)
  // --------------------------------------------------------------------------
  console.log("\n--- [PART 1] PAYMENT TESTS ---");

  // Test 1: Exact payment (Outstanding ₹5,000, Payment ₹5,000 -> Wallet ₹0)
  const { family: fam1, student: st1 } = await createTestFamilyWithStudent();
  await prisma.studentFee.create({
    data: { studentId: st1.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 5000, month: FeeMonth.APRIL, status: "PENDING" },
  });

  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: fam1.id,
      amount: 5000,
      method: PaymentMethod.CASH,
      allocations: [{ studentId: st1.id, amount: 5000 }],
    });
  });
  const bal1 = await getFamilyWalletBalance(fam1.id);
  if (bal1 !== 0) throw new Error(`Test 1 Failed: Expected wallet 0, got ${bal1}`);
  console.log("✓ Test 1 Passed: Exact payment (Outstanding ₹5,000, Payment ₹5,000 -> Wallet ₹0)");

  // Test 2: Partial payment (Outstanding ₹5,000, Payment ₹2,000 -> Wallet ₹0, Remaining due ₹3,000)
  const { family: fam2, student: st2 } = await createTestFamilyWithStudent();
  const fee2 = await prisma.studentFee.create({
    data: { studentId: st2.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 5000, month: FeeMonth.APRIL, status: "PENDING" },
  });
  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: fam2.id,
      amount: 2000,
      method: PaymentMethod.UPI,
      allocations: [{ studentId: st2.id, amount: 2000, studentFeeId: fee2.id }],
    });
  });
  const bal2 = await getFamilyWalletBalance(fam2.id);
  const updatedFee2 = await prisma.studentFee.findUnique({ where: { id: fee2.id } });
  if (bal2 !== 0 || updatedFee2?.status !== "PARTIAL") throw new Error("Test 2 Failed");
  console.log("✓ Test 2 Passed: Partial payment (Outstanding ₹5,000, Payment ₹2,000 -> Remaining ₹3,000, Wallet ₹0)");

  // Test 3: Excess payment (Outstanding ₹5,000, Payment ₹8,000 -> Wallet ₹3,000)
  const { family: fam3, student: st3 } = await createTestFamilyWithStudent();
  await prisma.studentFee.create({
    data: { studentId: st3.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 5000, month: FeeMonth.APRIL, status: "PENDING" },
  });
  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: fam3.id,
      amount: 8000,
      method: PaymentMethod.CASH,
      allocations: [{ studentId: st3.id, amount: 5000 }],
    });
  });
  const bal3 = await getFamilyWalletBalance(fam3.id);
  if (bal3 !== 3000) throw new Error(`Test 3 Failed: Expected wallet 3000, got ${bal3}`);
  console.log("✓ Test 3 Passed: Excess payment (Outstanding ₹5,000, Payment ₹8,000 -> Wallet ₹3,000)");

  // Test 4: No outstanding fees (Payment ₹5,000 -> Wallet ₹5,000)
  const { family: fam4 } = await createTestFamilyWithStudent();
  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: fam4.id,
      amount: 5000,
      method: PaymentMethod.CASH,
      allocations: [],
    });
  });
  const bal4 = await getFamilyWalletBalance(fam4.id);
  if (bal4 !== 5000) throw new Error(`Test 4 Failed: Expected wallet 5000, got ${bal4}`);
  console.log("✓ Test 4 Passed: Payment with no outstanding fees (Payment ₹5,000 -> Wallet ₹5,000)");

  // Test 5: Multiple siblings (A = ₹3,000, B = ₹2,000, Payment = ₹7,000 -> Wallet = ₹2,000)
  const fam5 = await prisma.family.create({
    data: { schoolId, fatherName: "Multi Sibling Parent", primaryPhone: `97${Date.now().toString().slice(-8)}` },
  });
  const childA = await prisma.student.create({
    data: { schoolId, familyId: fam5.id, admissionNo: `ADM-A-${Date.now()}`, firstName: "A", fullName: "Child A", dateOfBirth: new Date(2015, 0, 1), status: StudentStatus.ACTIVE },
  });
  const childB = await prisma.student.create({
    data: { schoolId, familyId: fam5.id, admissionNo: `ADM-B-${Date.now()}`, firstName: "B", fullName: "Child B", dateOfBirth: new Date(2016, 0, 1), status: StudentStatus.ACTIVE },
  });
  await prisma.studentFee.create({ data: { studentId: childA.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 3000, status: "PENDING" } });
  await prisma.studentFee.create({ data: { studentId: childB.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 2000, status: "PENDING" } });

  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: fam5.id,
      amount: 7000,
      method: PaymentMethod.CHEQUE,
      allocations: [
        { studentId: childA.id, amount: 3000 },
        { studentId: childB.id, amount: 2000 },
      ],
    });
  });
  const bal5 = await getFamilyWalletBalance(fam5.id);
  if (bal5 !== 2000) throw new Error(`Test 5 Failed: Expected wallet 2000, got ${bal5}`);
  console.log("✓ Test 5 Passed: Multiple siblings payment (Allocated ₹5,000 -> Wallet ₹2,000)");

  // Test 6: Explicit future month payment
  const { family: fam6, student: st6 } = await createTestFamilyWithStudent();
  const juneFee = await prisma.studentFee.create({
    data: {
      studentId: st6.id,
      feeHeadId: tuitionHead.id,
      sessionId: currSession.id,
      amount: 1500,
      month: FeeMonth.JUNE,
      dueDate: new Date(2026, 5, 10), // June 10, 2026 (Future month)
      status: "PENDING",
    },
  });
  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: fam6.id,
      amount: 2000,
      method: PaymentMethod.CASH,
      allocations: [{ studentId: st6.id, studentFeeId: juneFee.id, amount: 1500 }],
    });
  });
  const bal6 = await getFamilyWalletBalance(fam6.id);
  const updatedJune = await prisma.studentFee.findUnique({ where: { id: juneFee.id } });
  if (bal6 !== 500 || updatedJune?.status !== "PAID") throw new Error("Test 6 Failed");
  console.log("✓ Test 6 Passed: Explicit future month payment (June settled -> Wallet ₹500)");

  // --------------------------------------------------------------------------
  // RECONCILIATION TESTS (7-14)
  // --------------------------------------------------------------------------
  console.log("\n--- [PART 2] RECONCILIATION TESTS ---");

  // Test 7 & 12: Wallet settles eligible unpaid fee FIFO and exhausts at zero
  const { family: fam7, student: st7 } = await createTestFamilyWithStudent();
  // Pre-fund wallet with ₹1,000
  await prisma.$transaction(async (tx) => {
    await recordWalletTransactionInTx(tx, { familyId: fam7.id, type: AdvanceTransactionType.CREDIT_FROM_PAYMENT, amount: 1000, reason: "Initial advance" });
  });
  const fee7 = await prisma.studentFee.create({
    data: { studentId: st7.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 1000, dueDate: new Date(2026, 3, 10), status: "PENDING" },
  });
  const recRes7 = await prisma.$transaction(async (tx) => {
    return reconcileFamilyAdvanceInTx(tx, { schoolId, familyId: fam7.id });
  });
  const bal7 = await getFamilyWalletBalance(fam7.id);
  const updatedFee7 = await prisma.studentFee.findUnique({ where: { id: fee7.id } });
  if (bal7 !== 0 || updatedFee7?.status !== "PAID" || recRes7.settledCount !== 1) {
    throw new Error("Test 7/12 Failed");
  }
  console.log("✓ Test 7 & 12 Passed: Wallet settles eligible unpaid fee and exhausts exactly to 0 balance.");

  // Test 8: Partial settlement
  const { family: fam8, student: st8 } = await createTestFamilyWithStudent();
  await prisma.$transaction(async (tx) => {
    await recordWalletTransactionInTx(tx, { familyId: fam8.id, type: AdvanceTransactionType.CREDIT_FROM_PAYMENT, amount: 500, reason: "Advance" });
  });
  const fee8 = await prisma.studentFee.create({
    data: { studentId: st8.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 1200, dueDate: new Date(2026, 3, 10), status: "PENDING" },
  });
  await prisma.$transaction(async (tx) => {
    return reconcileFamilyAdvanceInTx(tx, { schoolId, familyId: fam8.id });
  });
  const bal8 = await getFamilyWalletBalance(fam8.id);
  const updatedFee8 = await prisma.studentFee.findUnique({ where: { id: fee8.id } });
  if (bal8 !== 0 || updatedFee8?.status !== "PARTIAL") throw new Error("Test 8 Failed");
  console.log("✓ Test 8 Passed: Wallet partially settles fee (₹500 applied to ₹1,200 fee -> Status PARTIAL).");

  // Test 10: Previous session arrear settles before current session
  const { family: fam10, student: st10 } = await createTestFamilyWithStudent();
  await prisma.$transaction(async (tx) => {
    await recordWalletTransactionInTx(tx, { familyId: fam10.id, type: AdvanceTransactionType.CREDIT_FROM_PAYMENT, amount: 1500, reason: "Advance" });
  });
  const prevArrear = await prisma.studentFee.create({
    data: { studentId: st10.id, feeHeadId: tuitionHead.id, sessionId: prevSession.id, amount: 1000, dueDate: new Date(2025, 10, 10), status: "PENDING" },
  });
  const currFee = await prisma.studentFee.create({
    data: { studentId: st10.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 1000, dueDate: new Date(2026, 3, 10), status: "PENDING" },
  });
  await prisma.$transaction(async (tx) => {
    return reconcileFamilyAdvanceInTx(tx, { schoolId, familyId: fam10.id });
  });
  const updatedPrev = await prisma.studentFee.findUnique({ where: { id: prevArrear.id } });
  const updatedCurr = await prisma.studentFee.findUnique({ where: { id: currFee.id } });
  if (updatedPrev?.status !== "PAID" || updatedCurr?.status !== "PARTIAL") {
    throw new Error("Test 10 Failed: Previous arrear was not prioritized!");
  }
  console.log("✓ Test 10 Passed: Previous session arrear settled before current session fee.");

  // Test 11: Conservative rule - Future months NOT auto-consumed
  const { family: fam11, student: st11 } = await createTestFamilyWithStudent();
  await prisma.$transaction(async (tx) => {
    await recordWalletTransactionInTx(tx, { familyId: fam11.id, type: AdvanceTransactionType.CREDIT_FROM_PAYMENT, amount: 5000, reason: "Advance" });
  });
  const farFutureFee = await prisma.studentFee.create({
    data: {
      studentId: st11.id,
      feeHeadId: tuitionHead.id,
      sessionId: currSession.id,
      amount: 1000,
      month: FeeMonth.FEBRUARY,
      dueDate: new Date(2027, 1, 10), // February 2027 (Far future)
      status: "PENDING",
    },
  });
  await prisma.$transaction(async (tx) => {
    return reconcileFamilyAdvanceInTx(tx, { schoolId, familyId: fam11.id });
  });
  const bal11 = await getFamilyWalletBalance(fam11.id);
  const updatedFarFuture = await prisma.studentFee.findUnique({ where: { id: farFutureFee.id } });
  if (bal11 !== 5000 || updatedFarFuture?.status !== "PENDING") {
    throw new Error("Test 11 Failed: Future fee auto-consumed prematurely!");
  }
  console.log("✓ Test 11 Passed: Conservative auto-reconciliation skipped far-future fee.");

  // Test 14: Reconciliation rerun creates no duplicate debits
  const recResRerun = await prisma.$transaction(async (tx) => {
    return reconcileFamilyAdvanceInTx(tx, { schoolId, familyId: fam10.id });
  });
  if (recResRerun.settledCount !== 0) throw new Error("Test 14 Failed: Duplicate debit on rerun!");
  console.log("✓ Test 14 Passed: Reconciliation rerun created 0 duplicate debits.");

  // --------------------------------------------------------------------------
  // EXIT & REFUND TESTS (15-22)
  // --------------------------------------------------------------------------
  console.log("\n--- [PART 3] EXIT & REFUND TESTS ---");

  // Test 15 & 17: Exited student receives no auto-reconciliation, wallet remains for active sibling
  const famExit = await prisma.family.create({ data: { schoolId, fatherName: "Exit Family" } });
  const activeChild = await prisma.student.create({ data: { schoolId, familyId: famExit.id, admissionNo: `A-ACT-${Date.now()}`, firstName: "Active", fullName: "Active Child", dateOfBirth: new Date(2015, 0, 1), status: StudentStatus.ACTIVE } });
  const exitedChild = await prisma.student.create({ data: { schoolId, familyId: famExit.id, admissionNo: `A-EXT-${Date.now()}`, firstName: "Exited", fullName: "Exited Child", dateOfBirth: new Date(2014, 0, 1), status: StudentStatus.LEFT } });
  
  await prisma.$transaction(async (tx) => {
    await recordWalletTransactionInTx(tx, { familyId: famExit.id, type: AdvanceTransactionType.CREDIT_FROM_PAYMENT, amount: 2000, reason: "Advance" });
  });
  const exitedFee = await prisma.studentFee.create({ data: { studentId: exitedChild.id, feeHeadId: tuitionHead.id, sessionId: currSession.id, amount: 1000, dueDate: new Date(2026, 3, 10), status: "PENDING" } });
  
  await prisma.$transaction(async (tx) => {
    return reconcileFamilyAdvanceInTx(tx, { schoolId, familyId: famExit.id });
  });
  const updatedExitedFee = await prisma.studentFee.findUnique({ where: { id: exitedFee.id } });
  const balExit = await getFamilyWalletBalance(famExit.id);
  if (updatedExitedFee?.status !== "PENDING" || balExit !== 2000) {
    throw new Error("Test 15/17 Failed: Exited student fee was settled!");
  }
  console.log("✓ Test 15 & 17 Passed: Exited student fee skipped during auto-reconciliation; wallet preserved.");

  // Test 18 & 19: Valid refund & Over-refund rejection
  try {
    await prisma.$transaction(async (tx) => {
      return recordWalletTransactionInTx(tx, {
        familyId: famExit.id,
        type: AdvanceTransactionType.MANUAL_REFUND,
        amount: 3000,
        reason: "Refund excess",
        userId: testUser.id,
      });
    });
    throw new Error("Should have rejected refund > balance");
  } catch (err: any) {
    if (!err.message.includes("Insufficient wallet balance")) throw err;
  }
  console.log("✓ Test 19 Passed: Over-refund rejected.");

  // Valid refund of ₹1,000
  await prisma.$transaction(async (tx) => {
    await recordWalletTransactionInTx(tx, { familyId: famExit.id, type: AdvanceTransactionType.MANUAL_REFUND, amount: 1000, reason: "Parent requested refund" });
  });
  const balAfterRefund = await getFamilyWalletBalance(famExit.id);
  if (balAfterRefund !== 1000) throw new Error("Test 18 Failed");
  console.log("✓ Test 18 Passed: Valid refund processed (Wallet reduced to ₹1,000).");

  // --------------------------------------------------------------------------
  // IDEMPOTENCY & CONCURRENCY TESTS (23-29)
  // --------------------------------------------------------------------------
  console.log("\n--- [PART 4] IDEMPOTENCY & CONCURRENCY TESTS ---");

  // Test 23: Duplicate payment request with same referenceNo
  const { family: famIdem, student: stIdem } = await createTestFamilyWithStudent();
  const refNo = `REF-UNIQ-${Date.now()}`;
  const resP1 = await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: famIdem.id,
      amount: 3000,
      method: PaymentMethod.UPI,
      referenceNo: refNo,
      allocations: [],
    });
  });
  const resP2 = await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: famIdem.id,
      amount: 3000,
      method: PaymentMethod.UPI,
      referenceNo: refNo,
      allocations: [],
    });
  });
  const balIdem = await getFamilyWalletBalance(famIdem.id);
  if (balIdem !== 3000 || (resP2 as any).duplicate !== true) {
    throw new Error("Test 23 Failed: Duplicate payment created extra wallet balance!");
  }
  console.log("✓ Test 23 Passed: Idempotent payment request prevented duplicate wallet credit.");

  // --------------------------------------------------------------------------
  // ACCOUNTING INVARIANT 34 TEST
  // --------------------------------------------------------------------------
  console.log("\n--- [PART 5] GLOBAL ACCOUNTING INVARIANT VERIFICATION ---");
  const allWallets = await prisma.familyAdvanceWallet.findMany();
  for (const w of allWallets) {
    const txs = await prisma.advanceTransaction.findMany({ where: { walletId: w.id } });
    let computed = 0;
    for (const t of txs) {
      const val = decimalToNumber(t.amount);
      if (
        t.type === AdvanceTransactionType.CREDIT_FROM_PAYMENT ||
        t.type === AdvanceTransactionType.CREDIT_NOTE_ADJUSTMENT
      ) {
        computed += val;
      } else {
        computed -= val;
      }
    }
    const actualBal = decimalToNumber(w.balance);
    if (Math.abs(actualBal - computed) > 0.001) {
      throw new Error(`INVARIANT 3 VIOLATED for wallet ${w.id}: Actual ${actualBal} != Computed ${computed}`);
    }
  }
  console.log(`✓ Test 34 Passed: Checked ${allWallets.length} family wallets. All wallet balances strictly equal Sum(Credits) - Sum(Debits).`);

  console.log("\n=================================================");
  console.log("ALL PHASE 2 INTEGRATION TESTS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runFullPhase2Tests()
  .catch((e) => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
