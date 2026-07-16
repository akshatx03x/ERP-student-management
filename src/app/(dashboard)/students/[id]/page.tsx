import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudent } from "@/server/services/student.service";
import { getStudentFeeLedger, getStudentPortalFees } from "@/server/services/fee.service";
import { requirePermission } from "@/server/permissions/guard";
import { PageHeader } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StudentMedicalForm } from "./student-medical-form";
import { IdCardPrintButton } from "./id-card-print-button";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requirePermission("student.view");
  const isStudentSelf = user.role === "STUDENT" && user.studentId === id;

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.fullName}
        description={`Admission ${student.admissionNo}`}
        actions={
          !isStudentSelf ? (
            <Link href="/students" className="text-sm text-muted-foreground hover:underline">
              Back to students
            </Link>
          ) : (
            <Link href="/fees" className="text-sm text-muted-foreground hover:underline">
              View my fees
            </Link>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>DOB: {formatDate(student.dateOfBirth)}</p>
            <p>Gender: {student.gender || "—"}</p>
            <p>Blood group: {student.bloodGroup || "—"}</p>
            <p>
              Status: <Badge variant="secondary">{student.status}</Badge>
            </p>
            {!isStudentSelf ? (
              <>
                <p>
                  Family:{" "}
                  <Link
                    href={`/families/${student.familyId}`}
                    className="text-primary hover:underline"
                  >
                    {[student.family.fatherName, student.family.motherName]
                      .filter(Boolean)
                      .join(" · ") || "View family"}
                  </Link>
                </p>
                <p>Login: {student.user ? student.user.email : "Not created"}</p>
              </>
            ) : null}
            {ledger?.currentClass ? (
              <p>
                Current class:{" "}
                <span className="font-medium">{ledger.currentClass.label}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {isStudentSelf ? "Sibling information" : "Siblings"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isStudentSelf ? (
              portalSiblings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No siblings linked.</p>
              ) : (
                portalSiblings.map((s, i) => (
                  <div key={i} className="rounded-md border px-3 py-2 text-sm">
                    <p className="font-medium">{s.fullName}</p>
                    <p className="text-muted-foreground">
                      {s.classLabel} · Remaining fee {formatCurrency(s.remainingFee)}
                    </p>
                  </div>
                ))
              )
            ) : student.siblings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No siblings in this family.</p>
            ) : (
              student.siblings.map((s) => (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  {s.fullName} ({s.admissionNo})
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {ledger ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Fee ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded border px-3 py-2">
                  <p className="text-sm text-muted-foreground">Total fee</p>
                  <p className="text-lg font-semibold">{formatCurrency(ledger.totalFee)}</p>
                </div>
                <div className="rounded border px-3 py-2">
                  <p className="text-sm text-muted-foreground">Paid</p>
                  <p className="text-lg font-semibold">{formatCurrency(ledger.paid)}</p>
                </div>
                <div className="rounded border px-3 py-2">
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="text-lg font-semibold">{formatCurrency(ledger.remaining)}</p>
                </div>
              </div>

              {ledger.feeStructure ? (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    Fee structure · {ledger.feeStructure.name}
                  </p>
                  <div className="space-y-1 text-sm">
                    {ledger.feeStructure.items.map((item, i) => (
                      <div key={i} className="flex justify-between rounded border px-3 py-1.5">
                        <span>{item.feeHead}</span>
                        <span>{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : ledger.lines.length > 0 ? (
                <div className="space-y-1 text-sm">
                  {ledger.lines.map((line) => (
                    <div
                      key={line.id}
                      className="flex justify-between rounded border px-3 py-1.5"
                    >
                      <span>
                        {line.feeHead.name}{" "}
                        <Badge variant="outline">{line.status}</Badge>
                      </span>
                      <span>
                        {formatCurrency(line.paidAmount)} / {formatCurrency(line.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No fees attached yet. Fees are created automatically from the class fee
                  structure on admission.
                </p>
              )}

              {!isStudentSelf && ledger.paymentHistory.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Payment history</p>
                  <div className="max-h-48 space-y-1 overflow-auto text-sm">
                    {ledger.paymentHistory.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between rounded border px-3 py-1.5"
                      >
                        <span>
                          {formatDate(p.paidAt)} · {p.method}
                          {p.notes ? ` · ${p.notes}` : ""}
                        </span>
                        <span>{formatCurrency(p.allocatedToStudent)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Enrollment history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {student.enrollments.length === 0 ? (
              <p className="text-muted-foreground">No enrollments.</p>
            ) : (
              student.enrollments.map((e) => (
                <div key={e.id} className="flex justify-between rounded-md border px-3 py-2">
                  <span>
                    {e.session.name}: {e.class.name}-{e.section.name}
                    {e.rollNo ? ` · Roll ${e.rollNo}` : ""}
                  </span>
                  <Badge variant="outline">{e.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {!isStudentSelf ? (
          <Card>
            <CardHeader>
              <CardTitle>Medical</CardTitle>
            </CardHeader>
            <CardContent>
              <StudentMedicalForm
                studentId={student.id}
                initial={{
                  allergies: student.medical?.allergies ?? "",
                  conditions: student.medical?.conditions ?? "",
                  notes: student.medical?.notes ?? "",
                }}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>ID Card</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mx-auto max-w-sm rounded-lg border-2 border-primary/30 bg-card p-4 text-center">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Vidhyanjali Public School
              </p>
              <p className="mt-3 text-lg font-semibold">{student.fullName}</p>
              <p className="text-sm text-muted-foreground">
                Admission {student.admissionNo}
              </p>
              <p className="mt-2 text-sm">
                {student.enrollments[0]
                  ? `${student.enrollments[0].class.name}-${student.enrollments[0].section.name}`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                DOB {formatDate(student.dateOfBirth)}
              </p>
            </div>
            <IdCardPrintButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
