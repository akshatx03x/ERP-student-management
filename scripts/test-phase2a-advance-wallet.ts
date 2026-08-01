import { prisma } from "../src/server/lib/prisma";
import {
  getOrCreateFamilyWalletInTx,
  getFamilyWalletBalance,
  recordWalletTransactionInTx,
} from "../src/server/services/wallet.service";
import { AdvanceTransactionType } from "@prisma/client";
import { decimalToNumber } from "../src/server/lib/helpers";

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING PHASE 2A ADVANCE WALLET INTEGRATION TESTS");
  console.log("=================================================\n");

  let school = await prisma.school.findFirst();
  if (!school) {
    school = await prisma.school.create({
      data: { name: "Vidyanjali Test School", code: `VTS-W-${Date.now()}` },
    });
  }

  const testUser = await prisma.user.create({
    data: {
      email: `wallet-admin-${Date.now()}@school.com`,
      name: "Wallet Accountant",
      role: "ACCOUNTANT",
      schoolId: school.id,
    },
  });

  const family = await prisma.family.create({
    data: {
      schoolId: school.id,
      fatherName: "Wallet Test Parent",
      primaryPhone: `99${Date.now().toString().slice(-8)}`,
    },
  });

  console.log("✓ Test Setup Completed.");

  // Test 1: Wallet Creation & Duplicate Prevention
  const wallet1 = await prisma.$transaction(async (tx) => {
    return getOrCreateFamilyWalletInTx(tx, family.id);
  });
  console.log("✓ Test 1 Passed: Initialized wallet for family with 0 balance.");
  if (decimalToNumber(wallet1.balance) !== 0) throw new Error("Expected initial balance 0");

  const wallet1Duplicate = await prisma.$transaction(async (tx) => {
    return getOrCreateFamilyWalletInTx(tx, family.id);
  });
  if (wallet1.id !== wallet1Duplicate.id) throw new Error("Duplicate wallet created!");
  console.log("✓ Test 1.1 Passed: Duplicate wallet creation prevented; returned existing wallet.");

  // Test 2: Credit Transaction & Decimal Precision
  const creditAmount = 5000.50;
  const creditRes = await prisma.$transaction(async (tx) => {
    return recordWalletTransactionInTx(tx, {
      familyId: family.id,
      type: AdvanceTransactionType.CREDIT_FROM_PAYMENT,
      amount: creditAmount,
      reason: "Parent overpayment via UPI",
      userId: testUser.id,
    });
  });

  console.log(`✓ Test 2 Passed: Credit of ₹${creditAmount} recorded.`);
  if (decimalToNumber(creditRes.wallet.balance) !== 5000.50) {
    throw new Error(`Expected balance 5000.50, got ${decimalToNumber(creditRes.wallet.balance)}`);
  }
  if (creditRes.transaction.type !== AdvanceTransactionType.CREDIT_FROM_PAYMENT) {
    throw new Error("Incorrect transaction type recorded");
  }

  // Test 3: Debit Transaction
  const debitAmount = 2000.25;
  const debitRes = await prisma.$transaction(async (tx) => {
    return recordWalletTransactionInTx(tx, {
      familyId: family.id,
      type: AdvanceTransactionType.DEBIT_FEE_SETTLEMENT,
      amount: debitAmount,
      reason: "Manual settlement of Tuition fee",
      userId: testUser.id,
    });
  });

  console.log(`✓ Test 3 Passed: Debit of ₹${debitAmount} recorded.`);
  const expectedBalance = 5000.50 - 2000.25; // 3000.25
  if (decimalToNumber(debitRes.wallet.balance) !== expectedBalance) {
    throw new Error(`Expected balance ${expectedBalance}, got ${decimalToNumber(debitRes.wallet.balance)}`);
  }

  // Test 4: Invariant 1 - Negative Balance Rejection
  try {
    await prisma.$transaction(async (tx) => {
      return recordWalletTransactionInTx(tx, {
        familyId: family.id,
        type: AdvanceTransactionType.MANUAL_REFUND,
        amount: 999999, // Exceeds 3000.25 balance
        reason: "Excessive refund request",
        userId: testUser.id,
      });
    });
    throw new Error("Should have rejected debit exceeding balance");
  } catch (err: any) {
    if (err.message.includes("Insufficient wallet balance")) {
      console.log("✓ Test 4 Passed: Negative balance debit rejected successfully.");
    } else {
      throw err;
    }
  }

  // Test 5: Transaction Rollback (No Partial Writes)
  try {
    await prisma.$transaction(async (tx) => {
      await recordWalletTransactionInTx(tx, {
        familyId: family.id,
        type: AdvanceTransactionType.CREDIT_NOTE_ADJUSTMENT,
        amount: 1000,
        reason: "Temporary credit",
        userId: testUser.id,
      });
      throw new Error("SIMULATED_FAILURE");
    });
  } catch (err: any) {
    if (err.message === "SIMULATED_FAILURE") {
      const balancePostRollback = await getFamilyWalletBalance(family.id);
      if (balancePostRollback === expectedBalance) {
        console.log("✓ Test 5 Passed: Transaction rollback verified. Balance remained unchanged.");
      } else {
        throw new Error(`Rollback failed! Balance changed to ${balancePostRollback}`);
      }
    }
  }

  // Test 6: Zero & Invalid Amount Rejection
  try {
    await prisma.$transaction(async (tx) => {
      return recordWalletTransactionInTx(tx, {
        familyId: family.id,
        type: AdvanceTransactionType.CREDIT_FROM_PAYMENT,
        amount: 0,
        reason: "Zero payment",
        userId: testUser.id,
      });
    });
    throw new Error("Should have rejected zero transaction amount");
  } catch (err: any) {
    if (err.message.includes("Transaction amount must be greater than zero")) {
      console.log("✓ Test 6 Passed: Zero amount transaction rejected successfully.");
    } else {
      throw err;
    }
  }

  // Test 7: Balance Consistency (Invariant 3: Wallet balance == Sum(Credits) - Sum(Debits))
  const allTxs = await prisma.advanceTransaction.findMany({
    where: { familyId: family.id },
  });
  let computedBalance = 0;
  for (const t of allTxs) {
    const amt = decimalToNumber(t.amount);
    if (
      t.type === AdvanceTransactionType.CREDIT_FROM_PAYMENT ||
      t.type === AdvanceTransactionType.CREDIT_NOTE_ADJUSTMENT
    ) {
      computedBalance += amt;
    } else {
      computedBalance -= amt;
    }
  }

  const currentBal = await getFamilyWalletBalance(family.id);
  if (Math.abs(currentBal - computedBalance) > 0.001) {
    throw new Error(`Inconsistency! Wallet balance: ${currentBal}, Sum(Txs): ${computedBalance}`);
  }
  console.log(`✓ Test 7 Passed: Balance consistency verified: Wallet Balance (${currentBal}) == Sum(Txs) (${computedBalance}).`);

  console.log("\n=================================================");
  console.log("ALL PHASE 2A INTEGRATION TESTS PASSED SUCCESSFULLY");
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
