import { getStudentFinancialProfile } from "../src/server/services/financial-profile.service";
import { prisma } from "../src/server/lib/prisma";

async function main() {
  console.log("=== TESTING NIKKU FINANCIAL PROFILE FIX ===");

  const nikku = await prisma.student.findFirst({
    where: { admissionNo: "514" },
    include: { school: true },
  });

  if (!nikku) {
    console.log("Nikku not found!");
    return;
  }

  console.log(`Testing for Nikku (ID: ${nikku.id}, Adm: ${nikku.admissionNo})...`);

  // Call getStudentFinancialProfile with system admin override
  const profile = await getStudentFinancialProfile(nikku.id, undefined, {
    id: "system-test",
    role: "DEVELOPER" as any,
    schoolId: nikku.schoolId,
  });

  console.log("\n--- FINANCIAL PROFILE RESULT ---");
  console.log(`Student Name: ${profile.student.fullName}`);
  console.log(`Class Label: ${profile.student.currentEnrollment?.label ?? "None"}`);
  console.log(`Session Name: ${profile.student.currentEnrollment?.sessionName ?? "None"}`);
  console.log(`Total Outstanding Dues: ₹${profile.summary.totalRemaining}`);
  console.log(`Total Paid: ₹${profile.summary.totalPaid}`);
  console.log(`Monthly Matrix Length: ${profile.monthlyMatrix.length}`);

  console.log("\nMonthly Breakdown:");
  for (const m of profile.monthlyMatrix) {
    console.log(` - Month: ${m.monthName} (${m.month}), Net Due: ₹${m.netDue}, Remaining: ₹${m.remaining}, Status: ${m.status}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
