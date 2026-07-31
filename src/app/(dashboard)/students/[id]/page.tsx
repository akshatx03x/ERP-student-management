import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudent } from "@/server/services/student.service";
import { getStudentFeeLedger, getStudentPortalFees } from "@/server/services/fee.service";
import { getStudentFinancialProfile } from "@/server/services/financial-profile.service";
import { requirePermission, resolveEffectivePermissions } from "@/server/permissions/guard";
import { StudentProfileCard } from "./student-profile-card";
import { StudentFinancialDashboard } from "@/components/fee-dashboard/student-financial-dashboard";
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

  console.time(`[perf] StudentDetailPage ${id}`);

  const { user } = await requirePermission("student.view");
  const isStudentSelf = user.role === "STUDENT" && user.studentId === id;
  const perms = await resolveEffectivePermissions(user.id, user.role);
  const canDelete = perms.has("student.delete") && !isStudentSelf;

  // ── Fire all independent data queries simultaneously ──────────────────────
  const [studentResult, ledgerResult, financialProfileResult, portalResult] = await Promise.allSettled([
    getStudent(id),
    getStudentFeeLedger(id),
    getStudentFinancialProfile(id),
    isStudentSelf ? getStudentPortalFees() : Promise.resolve(null),
  ]);

  console.timeEnd(`[perf] StudentDetailPage ${id}`);

  if (studentResult.status === "rejected") notFound();

  const student = studentResult.value;
  const ledger = ledgerResult.status === "fulfilled" ? ledgerResult.value : null;
  const financialProfile = financialProfileResult.status === "fulfilled" ? financialProfileResult.value : null;
  const portalSiblings =
    portalResult.status === "fulfilled" && portalResult.value
      ? portalResult.value.siblings
      : [];


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
              admissionDate: student.admissionDate,
              gender: student.gender,
              bloodGroup: student.bloodGroup,
              aadhaar: student.aadhaar,
              religion: student.religion,
              category: student.category,
              apaarId: student.apaarId,
              penId: student.penId,
              previousSchoolName: student.previousSchoolName,
              transportRequired: student.transportRequired,
              transportPickupPoint: student.transportPickupPoint,
              photoUrl: student.photoUrl,
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

      {/* Section 5: Student Exit Details (if former student) */}
      {student.exitInfo && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="px-5 py-3 border-b border-destructive/20">
            <CardTitle className="text-sm font-semibold text-destructive flex items-center justify-between">
              <span>Student Exit Details</span>
              <Badge variant="destructive" className="uppercase text-[10px]">
                {student.exitInfo.reason}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 py-4 text-xs space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="block uppercase text-[10px] font-semibold text-muted-foreground mb-0.5">Leaving Date</span>
                <span className="font-semibold text-foreground">{formatDate(student.exitInfo.leavingDate)}</span>
              </div>
              <div>
                <span className="block uppercase text-[10px] font-semibold text-muted-foreground mb-0.5">TC Number</span>
                <span className="font-mono font-semibold text-foreground">{student.exitInfo.tcNumber || "—"}</span>
              </div>
              <div>
                <span className="block uppercase text-[10px] font-semibold text-muted-foreground mb-0.5">TC Date</span>
                <span className="font-semibold text-foreground">{student.exitInfo.tcDate ? formatDate(student.exitInfo.tcDate) : "—"}</span>
              </div>
              <div>
                <span className="block uppercase text-[10px] font-semibold text-muted-foreground mb-0.5">Recorded By</span>
                <span className="font-semibold text-foreground">{student.exitInfo.createdBy?.name || "—"}</span>
              </div>
            </div>
            {student.exitInfo.remarks && (
              <div className="pt-2 border-t border-destructive/10">
                <span className="block uppercase text-[10px] font-semibold text-muted-foreground mb-0.5">Remarks</span>
                <p className="text-foreground">{student.exitInfo.remarks}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 6: Chronological Academic Timeline */}
      <Card className="border-border">
        <CardHeader className="px-5 py-3 border-b flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Academic Lifecycle Timeline</CardTitle>
          <span className="text-xs text-muted-foreground font-medium">Session-by-Session Progression</span>
        </CardHeader>
        <CardContent className="px-5 py-5">
          {student.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrollment history recorded.</p>
          ) : (
            <div className="space-y-6">
              {/* Visual Step-by-Step Flow */}
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted-foreground/20">
                {[...student.enrollments].reverse().map((e, index, arr) => {
                  const isLatest = index === arr.length - 1;
                  return (
                    <div key={e.id} className="relative flex items-start gap-4">
                      {/* Timeline Node Dot */}
                      <div
                        className={`absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                          isLatest && e.status === "ACTIVE"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "border-muted-foreground/40 bg-background text-muted-foreground"
                        }`}
                      >
                        {index + 1}
                      </div>

                      <div className="flex-1 rounded-lg border bg-card p-3 shadow-2xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-foreground">
                            {e.session.name}
                          </span>
                          <Badge
                            variant={
                              e.status === "ACTIVE"
                                ? "success"
                                : e.status === "PROMOTED"
                                  ? "secondary"
                                  : e.status === "RETAINED"
                                    ? "warning"
                                    : "outline"
                            }
                            className="text-[10px] h-5 px-2 font-semibold"
                          >
                            {e.status === "ACTIVE" ? "ACTIVE (Current)" : e.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Class: <strong className="text-foreground font-semibold">{e.class.name}&#8209;{e.section.name}</strong>
                          </span>
                          <span>
                            Roll No: <strong className="text-foreground font-semibold">{e.rollNo || "—"}</strong>
                          </span>
                          <span>
                            House: <strong className="text-foreground font-semibold">{e.house || "—"}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CONSOLIDATED STUDENT FINANCIAL DASHBOARD ── */}
      {financialProfile && (
        <div className="mt-8 border-t border-slate-800 pt-6">
          <StudentFinancialDashboard profile={financialProfile} userRole={user.role} />
        </div>
      )}
    </div>
  );
}
