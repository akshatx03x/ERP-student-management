import Link from "next/link";
import { notFound } from "next/navigation";
import { getFamily } from "@/server/services/family.service";
import { getFamilyFeeDues } from "@/server/services/fee.service";
import { PageHeader } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decimalToNumber } from "@/server/lib/helpers";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FamilyProfileCards } from "./family-profile-cards";

export default async function FamilyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  console.time("[perf] FamilyDetailPage");

  // ── Fire both queries in parallel — they are independent of each other. ──
  const [familyResult, duesResult] = await Promise.allSettled([
    getFamily(id),
    getFamilyFeeDues(id),
  ]);

  console.timeEnd("[perf] FamilyDetailPage");

  if (familyResult.status === "rejected") {
    notFound();
  }

  const family = familyResult.value;
  const dues = duesResult.status === "fulfilled" ? duesResult.value : [];

  const title =
    [family.fatherName, family.motherName].filter(Boolean).join(" & ") ||
    family.guardianName ||
    "Family";

  const siblingNames = family.students.map((s) => s.fullName);
  const duesByStudent = new Map(dues.map((d) => [d.studentId, d]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Family overview — parents, students, and fee payments"
        actions={
          <Link href="/families" className="text-sm text-muted-foreground hover:underline">
            Back to families
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FamilyProfileCards family={family} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Linked students & fee balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {family.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students linked yet.</p>
            ) : (
              family.students.map((s) => {
                const enrollment = s.enrollments[0];
                const due = duesByStudent.get(s.id);
                return (
                  <Link
                    key={s.id}
                    href={`/students/${s.id}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <span>
                      {s.fullName}{" "}
                      <span className="text-muted-foreground">({s.admissionNo})</span>
                      {due ? (
                        <span className="mt-0.5 block text-muted-foreground">
                          Total {formatCurrency(due.totalFee)} · Paid{" "}
                          {formatCurrency(due.paid)} · Remaining{" "}
                          {formatCurrency(due.remaining)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {enrollment ? (
                        <Badge variant="outline">
                          {enrollment.class.name}-{enrollment.section.name}
                        </Badge>
                      ) : null}
                      <Badge variant="secondary">{s.status}</Badge>
                    </span>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sibling relationships</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {siblingNames.length <= 1 ? (
              <p className="text-muted-foreground">
                {siblingNames.length === 0
                  ? "No students in this family yet."
                  : `${siblingNames[0]} has no siblings linked in this family.`}
              </p>
            ) : (
              <ul className="list-inside list-disc space-y-1">
                {family.students.map((s) => (
                  <li key={s.id}>
                    {s.fullName}
                    <span className="text-muted-foreground">
                      {" "}
                      — sibling of{" "}
                      {family.students
                        .filter((o) => o.id !== s.id)
                        .map((o) => o.fullName)
                        .join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Digital fee register — every payment made by the parent, with sibling allocation.
          </p>
          {family.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments recorded for this family yet. Record payments from the Fees page.
            </p>
          ) : (
            family.payments.map((payment) => (
              <div key={payment.id} className="rounded-md border p-4 text-sm">
                <div className="mb-3 grid gap-1 sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Date:</span>{" "}
                    {formatDate(payment.paidAt)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Amount:</span>{" "}
                    {formatCurrency(decimalToNumber(payment.amount))}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Payment mode:</span>{" "}
                    {payment.method}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Reference number:</span>{" "}
                    {payment.referenceNo || "—"}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="text-muted-foreground">Remarks:</span>{" "}
                    {payment.notes || "—"}
                  </p>
                  <p className="sm:col-span-2 text-muted-foreground">
                    Receipt {payment.receiptNo}
                    {payment.recordedBy?.name ? ` · Recorded by ${payment.recordedBy.name}` : ""}
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-medium">Allocated to</p>
                  {payment.allocations.length === 0 ? (
                    <p className="text-muted-foreground">No allocation details.</p>
                  ) : (
                    <ul className="space-y-1">
                      {payment.allocations.map((a) => (
                        <li
                          key={a.id}
                          className="flex justify-between rounded border px-3 py-1.5"
                        >
                          <span>
                            {a.student.fullName}
                            {a.studentFee?.feeHead?.name ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ({a.studentFee.feeHead.name})
                              </span>
                            ) : null}
                          </span>
                          <span>{formatCurrency(decimalToNumber(a.amount))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
