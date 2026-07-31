import { prisma } from "../src/server/lib/prisma";
import {
  recordFamilyPaymentInTx,
} from "../src/server/services/fee.service";
import {
  createFeeDiscountInTx,
  revokeFeeDiscountInTx,
  calculateDiscountForAmount,
} from "../src/server/services/discount.service";
import { getFamilyWalletBalance } from "../src/server/services/wallet.service";
import {
  AdvanceTransactionType,
  DiscountCategory,
  DiscountType,
  FeeFrequency,
  FeeMonth,
  PaymentMethod,
  StudentStatus,
} from "@prisma/client";
import { decimalToNumber, toDecimal } from "../src/server/lib/helpers";

async function runPhase3Tests() {
  console.log("=================================================");
  console.log("RUNNING COMPREHENSIVE PHASE 3 DISCOUNT TESTS");
  console.log("=================================================\n");

  let school = await prisma.school.findFirst();
  if (!school) {
    school = await prisma.school.create({
      data: { name: "Vidhyanjali Phase 3 School", code: `VTS-P3-${Date.now()}` },
    });
  }
  const schoolId = school.id;

  const testUser = await prisma.user.create({
    data: {
      email: `discount-admin-${Date.now()}@school.com`,
      name: "Discount Administrator",
      role: "ACCOUNTANT",
      schoolId,
    },
  });

  const session = await prisma.academicSession.create({
    data: {
      schoolId,
      name: `Session-Disc-${Date.now()}`,
      startDate: new Date(2026, 3, 1),
      endDate: new Date(2027, 2, 31),
      isCurrent: true,
    },
  });

  const tuitionHead = await prisma.feeHead.create({
    data: { schoolId, name: `Tuition-${Date.now()}`, frequency: FeeFrequency.MONTHLY },
  });

  const activityHead = await prisma.feeHead.create({
    data: { schoolId, name: `Activity-${Date.now()}`, frequency: FeeFrequency.ANNUAL },
  });

  async function createTestFamilyAndStudent() {
    const family = await prisma.family.create({
      data: { schoolId, fatherName: `Disc Parent ${Date.now()}`, primaryPhone: `96${Math.floor(Math.random()*100000000)}` },
    });
    const student = await prisma.student.create({
      data: {
        schoolId,
        familyId: family.id,
        admissionNo: `ADM-D-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        firstName: "DiscountChild",
        fullName: `Disc Child ${Date.now()}`,
        dateOfBirth: new Date(2015, 2, 1),
        admissionDate: new Date(2026, 3, 1),
        status: StudentStatus.ACTIVE,
      },
    });
    return { family, student };
  }

  console.log("✓ Test Setup Completed.");

  // --------------------------------------------------------------------------
  // TEST 1: Percentage Discount (20% off ₹2,000 tuition = ₹400 discount -> Net ₹1,600)
  // --------------------------------------------------------------------------
  const { family: fam1, student: st1 } = await createTestFamilyAndStudent();
  const fee1 = await prisma.studentFee.create({
    data: {
      studentId: st1.id,
      feeHeadId: tuitionHead.id,
      sessionId: session.id,
      amount: 2000,
      month: FeeMonth.APRIL,
      status: "PENDING",
    },
  });

  const res1 = await prisma.$transaction(async (tx) => {
    return createFeeDiscountInTx(tx, {
      schoolId,
      studentId: st1.id,
      sessionId: session.id,
      feeHeadId: tuitionHead.id,
      discountType: DiscountType.PERCENTAGE,
      value: 20, // 20%
      category: DiscountCategory.MERIT,
      reason: "Merit 20% concession",
      userId: testUser.id,
    });
  });

  const updatedFee1 = await prisma.studentFee.findUnique({ where: { id: fee1.id } });
  if (decimalToNumber(updatedFee1!.discountAmount) !== 400) {
    throw new Error(`Test 1 Failed: Expected discount 400, got ${decimalToNumber(updatedFee1!.discountAmount)}`);
  }
  console.log("✓ Test 1 Passed: Percentage discount (20% off ₹2,000 -> ₹400 discount, Net due ₹1,600).");

  // --------------------------------------------------------------------------
  // TEST 2: Fixed Amount Discount (₹500 off Activity fee ₹1,500 -> Net ₹1,000)
  // --------------------------------------------------------------------------
  const fee2 = await prisma.studentFee.create({
    data: {
      studentId: st1.id,
      feeHeadId: activityHead.id,
      sessionId: session.id,
      amount: 1500,
      month: FeeMonth.APRIL,
      status: "PENDING",
    },
  });

  await prisma.$transaction(async (tx) => {
    return createFeeDiscountInTx(tx, {
      schoolId,
      studentId: st1.id,
      sessionId: session.id,
      feeHeadId: activityHead.id,
      discountType: DiscountType.FIXED_AMOUNT,
      value: 500,
      category: DiscountCategory.SPORTS,
      reason: "Sports quota concession",
      userId: testUser.id,
    });
  });

  const updatedFee2 = await prisma.studentFee.findUnique({ where: { id: fee2.id } });
  if (decimalToNumber(updatedFee2!.discountAmount) !== 500) {
    throw new Error(`Test 2 Failed: Expected discount 500, got ${decimalToNumber(updatedFee2!.discountAmount)}`);
  }
  console.log("✓ Test 2 Passed: Fixed amount discount (₹500 off ₹1,500 -> ₹500 discount).");

  // --------------------------------------------------------------------------
  // TEST 3: Duplicate Active Category Prevention
  // --------------------------------------------------------------------------
  try {
    await prisma.$transaction(async (tx) => {
      return createFeeDiscountInTx(tx, {
        schoolId,
        studentId: st1.id,
        sessionId: session.id,
        feeHeadId: tuitionHead.id,
        discountType: DiscountType.PERCENTAGE,
        value: 10,
        category: DiscountCategory.MERIT, // Duplicate category
        reason: "Duplicate merit",
        userId: testUser.id,
      });
    });
    throw new Error("Should have rejected duplicate active discount category");
  } catch (err: any) {
    if (!err.message.includes("An active discount of this category already exists")) throw err;
  }
  console.log("✓ Test 3 Passed: Duplicate active category discount rejected.");

  // --------------------------------------------------------------------------
  // TEST 4: Retrospective Discount (Fee fully paid, later discount approved -> Wallet credited)
  // --------------------------------------------------------------------------
  const { family: fam4, student: st4 } = await createTestFamilyAndStudent();
  const fee4 = await prisma.studentFee.create({
    data: {
      studentId: st4.id,
      feeHeadId: tuitionHead.id,
      sessionId: session.id,
      amount: 3000,
      month: FeeMonth.MAY,
      status: "PENDING",
    },
  });

  // Parent pays full ₹3,000
  await prisma.$transaction(async (tx) => {
    return recordFamilyPaymentInTx(tx, {
      schoolId,
      userId: testUser.id,
      familyId: fam4.id,
      amount: 3000,
      method: PaymentMethod.CASH,
      allocations: [{ studentId: st4.id, studentFeeId: fee4.id, amount: 3000 }],
    });
  });

  const preWalletBal = await getFamilyWalletBalance(fam4.id);
  if (preWalletBal !== 0) throw new Error("Pre-wallet balance should be 0");

  // Accountant later approves a retrospective ₹1,000 Staff Child concession
  const retroRes = await prisma.$transaction(async (tx) => {
    return createFeeDiscountInTx(tx, {
      schoolId,
      studentId: st4.id,
      sessionId: session.id,
      feeHeadId: tuitionHead.id,
      month: FeeMonth.MAY,
      discountType: DiscountType.FIXED_AMOUNT,
      value: 1000,
      category: DiscountCategory.STAFF_CHILD,
      reason: "Staff child retrospective discount",
      userId: testUser.id,
    });
  });

  const postWalletBal = await getFamilyWalletBalance(fam4.id);
  if (postWalletBal !== 1000 || decimalToNumber(retroRes.retrospectiveCreditAmount) !== 1000) {
    throw new Error(`Test 4 Failed: Expected retrospective credit 1000, got wallet balance ${postWalletBal}`);
  }

  // Verify immutable AdvanceTransaction record
  const retroTx = await prisma.advanceTransaction.findFirst({
    where: { familyId: fam4.id, type: AdvanceTransactionType.CREDIT_NOTE_ADJUSTMENT },
  });
  if (!retroTx || decimalToNumber(retroTx.amount) !== 1000) {
    throw new Error("Retrospective AdvanceTransaction CREDIT_NOTE_ADJUSTMENT missing!");
  }
  console.log("✓ Test 4 Passed: Retrospective discount credited ₹1,000 to FamilyAdvanceWallet (CREDIT_NOTE_ADJUSTMENT).");

  // --------------------------------------------------------------------------
  // TEST 5: Discount Revocation
  // --------------------------------------------------------------------------
  await prisma.$transaction(async (tx) => {
    return revokeFeeDiscountInTx(tx, {
      discountId: res1.discount.id,
      reason: "Grade criteria not met",
      userId: testUser.id,
    });
  });

  const fee1PostRevoke = await prisma.studentFee.findUnique({ where: { id: fee1.id } });
  if (decimalToNumber(fee1PostRevoke!.discountAmount) !== 0) {
    throw new Error(`Test 5 Failed: Expected 0 discount after revocation, got ${decimalToNumber(fee1PostRevoke!.discountAmount)}`);
  }
  console.log("✓ Test 5 Passed: Fee discount revoked; StudentFee discountAmount reset to 0.");

  // --------------------------------------------------------------------------
  // TEST 6: Validation Rejections (Percentage > 100, Invalid values)
  // --------------------------------------------------------------------------
  try {
    await prisma.$transaction(async (tx) => {
      return createFeeDiscountInTx(tx, {
        schoolId,
        studentId: st1.id,
        sessionId: session.id,
        discountType: DiscountType.PERCENTAGE,
        value: 150, // Invalid
        category: DiscountCategory.SCHOLARSHIP,
        reason: "Invalid scholarship",
        userId: testUser.id,
      });
    });
    throw new Error("Should have rejected percentage > 100");
  } catch (err: any) {
    if (!err.message.includes("Percentage discount cannot exceed 100%")) throw err;
  }
  console.log("✓ Test 6 Passed: Invalid discount (>100%) rejected by validator.");

  // --------------------------------------------------------------------------
  // TEST 7: Audit Log Verification
  // --------------------------------------------------------------------------
  const discAudit = await prisma.auditLog.findFirst({
    where: { entityType: "FeeDiscount", action: "create" },
  });
  if (!discAudit) throw new Error("Audit log for FeeDiscount create missing!");
  console.log("✓ Test 7 Passed: Audit log written for FeeDiscount operations.");

  console.log("\n=================================================");
  console.log("ALL PHASE 3 DISCOUNT TESTS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runPhase3Tests()
  .catch((e) => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
