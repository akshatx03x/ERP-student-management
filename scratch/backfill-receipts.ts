import { prisma } from "../src/server/lib/prisma";

async function main() {
  const payments = await prisma.familyPayment.findMany({
    include: { family: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${payments.length} payments to backfill.`);

  const schoolCounters = new Map<string, number>();

  for (const payment of payments) {
    const schoolId = payment.family.schoolId;
    if (!schoolId) {
      console.warn(`Payment ${payment.id} has no schoolId on family!`);
      continue;
    }

    const currentNumber = schoolCounters.get(schoolId) ?? 10000;
    const newNumber = currentNumber + 1;
    schoolCounters.set(schoolId, newNumber);

    await prisma.familyPayment.update({
      where: { id: payment.id },
      data: {
        schoolId,
        receiptNumber: payment.receiptNumber ?? newNumber,
      },
    });

    const counterId = `receipt_human_no:${schoolId}`;
    const existingCounter = await prisma.systemCounter.findUnique({ where: { id: counterId } });
    if (!existingCounter || existingCounter.value < newNumber) {
      await prisma.systemCounter.upsert({
        where: { id: counterId },
        update: { value: newNumber },
        create: { id: counterId, value: newNumber },
      });
    }

    console.log(`Payment ${payment.id} (${payment.receiptNo}) updated: schoolId=${schoolId}, receiptNumber=${newNumber}`);
  }

  console.log("Backfill completed.");
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
