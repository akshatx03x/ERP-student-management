import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudent } from "@/server/services/student.service";
import { getStudentFeeLedger, getStudentPortalFees } from "@/server/services/fee.service";
import { requirePermission, resolveEffectivePermissions } from "@/server/permissions/guard";
import { StudentProfileCard } from "./student-profile-card";
import { PageHeader } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requirePermission("student.view");
  const isStudentSelf = user.role === "STUDENT" && user.studentId === id;
  const perms = await resolveEffectivePermissions(user.id, user.role);
  const canDelete = perms.has("student.delete") && !isStudentSelf;

  let student;
  try {
    student = await getStudent(id);
  } catch {
    notFound();
  }

  let ledger: Awaited<ReturnType<typeof getStudentFeeLedger>> | null = null;
  try {
    ledger = await getStudentFeeLedger(id);
  } catch {
    ledger = null;
  }

  let portalSiblings: Array<{
    fullName: string;
    classLabel: string;
    remainingFee: number;
  }> = [];
  if (isStudentSelf) {
    try {
      const portal = await getStudentPortalFees();
      portalSiblings = portal.siblings;
    } catch {
      portalSiblings = [];
    }
  }

  // Address assembly
  const family = student.family;
  const addressParts = [
    family.addressLine1,
    family.addressLine2,
    family.city,
    family.state,
    family.pincode,
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "—";

  // Serialize Decimal amounts on sibling fee data so they can cross the Server→Client boundary.
  const siblings = student.siblings.map((s) => ({
    ...s,
    studentFees: (s.studentFees || []).map((f) => ({
      ...f,
      amount: Number(f.amount),
      allocations: (f.allocations || []).map((a) => ({
        ...a,
        amount: Number(a.amount),
      })),
    })),
  }));

  type SiblingItem = (typeof siblings)[number];

  // Sibling dues helper
  const getSiblingRemainingFee = (sibling: SiblingItem) => {
    const fees = sibling.studentFees || [];
    const total = fees.reduce((sum: number, f) => sum + Number(f.amount), 0);
    const paid = fees.reduce(
      (sum: number, f) =>
        sum + (f.allocations || []).reduce((s: number, a) => s + Number(a.amount), 0),
      0
    );
    return Math.max(0, total - paid);
  };

  const currentEnrollment = student.enrollments[0] ?? null;


  // Fee Breakdown logic
  const feeStructureItems = ledger?.feeStructure?.items ?? [];
  const studentFeeLines = ledger?.lines ?? [];
  const studentFeeMap = new Map(studentFeeLines.map((line) => [line.feeHead.name, line]));

  const feeBreakdown = feeStructureItems.map((item) => {
    const studentFee = studentFeeMap.get(item.feeHead);
    if (studentFee) {
      return {
        name: item.feeHead,
        opted: true,
        amount: studentFee.amount,
        paid: studentFee.paidAmount,
        remaining: studentFee.remaining,
        status: studentFee.status,
      };
    } else {
      return {
        name: item.feeHead,
        opted: false,
        amount: item.amount,
      };
    }
  });

  // Add any custom student fees
  studentFeeLines.forEach((line) => {
    const inStructure = feeStructureItems.some((item) => item.feeHead === line.feeHead.name);
    if (!inStructure) {
      feeBreakdown.push({
        name: line.feeHead.name,
        opted: true,
        amount: line.amount,
        paid: line.paidAmount,
        remaining: line.remaining,
        status: line.status,
      });
    }
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={student.fullName}
        description={`Admission ${student.admissionNo}`}
        actions={
          !isStudentSelf ? (
            <Link href="/students" className="text-xs text-muted-foreground hover:underline">
              Back to students
            </Link>
          ) : (
            <Link href="/fees" className="text-xs text-muted-foreground hover:underline">
              View my fees
            </Link>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left Column: Student Information & Parent Details */}
        <div className="space-y-4">
          {/* Section 1: Student Information */}
          <StudentProfileCard
            student={{
              id: student.id,
              admissionNo: student.admissionNo,
              firstName: student.firstName,
              middleName: student.middleName,
              lastName: student.lastName,
              fullName: student.fullName,
              dateOfBirth: student.dateOfBirth,
              gender: student.gender,
              bloodGroup: student.bloodGroup,
              aadhaar: student.aadhaar,
              status: student.status,
              familyId: student.familyId,
              user: student.user,
            }}
            isStudentSelf={isStudentSelf}
            currentEnrollment={currentEnrollment}
            canDelete={canDelete}
          />

          {/* Section 2: Guardian Details */}
          <Card className="border-border">
            <CardHeader className="px-5 py-3 border-b">
              <CardTitle className="text-sm font-semibold">Guardian Details</CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground block mb-1">Father Name</span>
                  <span className="text-sm font-medium text-foreground">{family.fatherName || "—"}</span>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground block mb-1">Mother Name</span>
                  <span className="text-sm font-medium text-foreground">{family.motherName || "—"}</span>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground block mb-1">Primary Mobile</span>
                  <span className="text-sm font-medium text-foreground">{family.primaryPhone || "—"}</span>
                </div>
                {family.secondaryPhone && (
                  <div>
                    <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground block mb-1">Secondary Mobile</span>
                    <span className="text-sm font-medium text-foreground">{family.secondaryPhone}</span>
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground block mb-1">Address</span>
                  <span className="text-sm font-medium text-foreground">{fullAddress}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Fee Status & Siblings */}
        <div className="space-y-4">
          {/* Section 3: Fee Status */}
          {ledger ? (
            <Card className="border-border">
              <CardHeader className="px-5 py-3 border-b flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Fee Status</CardTitle>
                {ledger.currentClass && (
                  <span className="text-xs text-muted-foreground font-medium px-2 py-0.5 rounded bg-muted/60 border border-muted/80">
                    {ledger.currentClass.label}
                  </span>
                )}
              </CardHeader>
              <CardContent className="px-5 py-4 space-y-3">
                {ledger.feeStructure && (
                  <div className="flex items-center justify-between text-xs bg-muted/30 border rounded px-3 py-2">
                    <span className="font-medium text-muted-foreground">Fee Structure</span>
                    <span className="font-semibold text-foreground">{ledger.feeStructure.name}</span>
                  </div>
                )}

                {/* Fee Breakdown Table */}
                <div className="overflow-hidden rounded border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/40 border-b text-xs uppercase font-semibold text-muted-foreground">
                      <tr>
                        <th className="py-2 pl-3 pr-2">Fee Head</th>
                        <th className="py-2 px-2 text-center">Status</th>
                        <th className="py-2 pl-2 pr-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feeBreakdown.map((item, idx) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-muted/10">
                          <td className="py-2 pl-3 pr-2 font-medium">{item.name}</td>
                          <td className="py-2 px-2 text-center">
                            {item.opted ? (
                              <span className="inline-flex items-center rounded-full  px-2 py-0.5 text-[10px] font-semibold text-black-700 ">
                                Opted
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border border-muted-foreground/20">
                                Not Opted
                              </span>
                            )}
                          </td>
                          <td className="py-2 pl-2 pr-3 text-right font-semibold">
                            {item.opted ? formatCurrency(item.amount) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Dues Summary Panel */}
                <div className="grid grid-cols-3 gap-2 border-t pt-3">
                  <div className="rounded border bg-muted/10 px-3 py-2.5 text-center">
                    <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold mb-0.5">Total Fee</span>
                    <span className="font-bold text-foreground text-sm">{formatCurrency(ledger.totalFee)}</span>
                  </div>
                  <div className="rounded border bg-emerald-500/5 dark:bg-emerald-500/10 px-3 py-2.5 text-center">
                    <span className="text-emerald-600 dark:text-emerald-400 block text-[10px] uppercase tracking-wider font-semibold mb-0.5">Paid</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">{formatCurrency(ledger.paid)}</span>
                  </div>
                  <div className="rounded border bg-destructive/5 px-3 py-2.5 text-center">
                    <span className="text-destructive block text-[10px] uppercase tracking-wider font-semibold mb-0.5">Remaining</span>
                    <span className="font-bold text-destructive text-sm">{formatCurrency(ledger.remaining)}</span>
                  </div>
                </div>

                {/* Receipts Section */}
                {!isStudentSelf && ledger.paymentHistory.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">Receipts / Payment History</p>
                    <div className="max-h-32 overflow-y-auto rounded border">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/30 border-b text-muted-foreground font-semibold">
                          <tr>
                            <th className="py-2 pl-3 pr-2">Date</th>
                            <th className="py-2 px-2">Receipt No</th>
                            <th className="py-2 px-2">Method</th>
                            <th className="py-2 pl-2 pr-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.paymentHistory.map((p) => (
                            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/10">
                              <td className="py-1.5 pl-3 pr-2 font-medium">{formatDate(p.paidAt)}</td>
                              <td className="py-1.5 px-2 font-mono text-[10px]">{p.receiptNo}</td>
                              <td className="py-1.5 px-2">{p.method}</td>
                              <td className="py-1.5 pl-2 pr-3 text-right font-semibold">{formatCurrency(p.allocatedToStudent)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border">
              <CardContent className="px-5 py-4 text-center text-muted-foreground text-sm">
                No fee structures attached.
              </CardContent>
            </Card>
          )}

          {/* Section 4: Siblings */}
          <Card className="border-border">
            <CardHeader className="px-5 py-3 border-b">
              <CardTitle className="text-sm font-semibold">
                {isStudentSelf ? "Sibling Information" : "Siblings"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-4">
              {isStudentSelf ? (
                portalSiblings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No siblings linked.</p>
                ) : (
                  <div className="space-y-2">
                    {portalSiblings.map((s, i) => {
                      const avatarInitials = s.fullName
                        ? s.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                        : "ST";
                      return (
                        <div key={i} className="flex items-center justify-between rounded border px-3 py-2.5 text-sm">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-muted text-muted-foreground border">
                              {avatarInitials}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{s.fullName}</p>
                              <p className="text-xs text-muted-foreground">{s.classLabel}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">Dues</span>
                            <span className="font-bold text-foreground text-sm">{formatCurrency(s.remainingFee)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : siblings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No siblings in this family.</p>
              ) : (
                <div className="space-y-2">
                  {siblings.map((s) => {
                    const enrollment = s.enrollments?.[0];
                    const classLabel = enrollment
                      ? `${enrollment.class.name}-${enrollment.section.name}`
                      : "—";
                    const remainingFee = getSiblingRemainingFee(s);
                    const avatarInitials = s.fullName
                      ? s.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                      : "ST";

                    const genderClass =
                      s.gender === "MALE"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : s.gender === "FEMALE"
                          ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300"
                          : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";

                    return (
                      <Link
                        key={s.id}
                        href={`/students/${s.id}`}
                        className="flex items-center justify-between rounded border px-3 py-2.5 text-sm hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${genderClass}`}>
                            {avatarInitials}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-primary">{s.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              Adm: {s.admissionNo} · {classLabel}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">Dues</span>
                          <span className={`font-bold text-sm ${remainingFee > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {formatCurrency(remainingFee)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 5: Enrollment History */}
      <Card className="border-border">
        <CardHeader className="px-5 py-3 border-b">
          <CardTitle className="text-sm font-semibold">Enrollment History</CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-4">
          {student.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollments recorded.</p>
          ) : (
            <div className="overflow-hidden rounded border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 border-b text-xs uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3">Session</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Section</th>
                    <th className="py-2.5 px-3">Roll No</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {student.enrollments.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="py-2.5 pl-4 pr-3 font-semibold text-foreground">{e.session.name}</td>
                      <td className="py-2.5 px-3">{e.class.name}</td>
                      <td className="py-2.5 px-3">{e.section.name}</td>
                      <td className="py-2.5 px-3">{e.rollNo || "—"}</td>
                      <td className="py-2.5 pl-3 pr-4 text-right">
                        <Badge
                          variant={e.status === "ACTIVE" ? "success" : "outline"}
                          className="h-5 px-2 text-[10px] font-semibold"
                        >
                          {e.status === "ACTIVE" ? "Current" : e.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
