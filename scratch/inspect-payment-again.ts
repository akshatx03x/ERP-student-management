import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const latestPayment = await prisma.familyPayment.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      allocations: {
        include: {
          student: true
        }
      },
      advanceTransactions: true
    }
  });

  if (!latestPayment) {
    console.log("No payments found");
    return;
  }

  console.log(`Latest Payment ID: ${latestPayment.id}`);
  console.log(`Amount: ${latestPayment.amount.toString()}`);
  console.log(`Method: ${latestPayment.method}`);
  console.log(`Created At: ${latestPayment.createdAt}`);
  console.log(`Allocations Count: ${latestPayment.allocations.length}`);
  for (const a of latestPayment.allocations) {
    console.log(`  Student: ${a.student.fullName}, Amount: ${a.amount.toString()}, Fee ID: ${a.studentFeeId}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
