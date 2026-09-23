import { requirePermission } from "@/server/permissions/guard";
import { getStudentPortalFees } from "@/server/services/fee.service";
import { prisma } from "@/server/lib/prisma";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { StudentStatus } from "@prisma/client";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { listClasses } from "@/server/services/class.service";
import { StudentFeesPortal } from "./student-fees-portal";
import { FeeCollectionClient } from "./fee-collection-client";

export default async function FeeCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; returnTo?: string; returnLabel?: string }>;
}) {
  const { student: initialStudentId, returnTo, returnLabel } = await searchParams;
  const { user } = await requirePermission("fee.view");

  if (user.role === "STUDENT") {
    const portal = await getStudentPortalFees();
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-900">My Fees</h1>
          <p className="text-sm text-stone-500 mt-0.5">Your fee structure, balance, and payment history</p>
        </div>
        <StudentFeesPortal data={portal} />
      </div>
    );
  }

  const schoolId = schoolIdFromUser(user);

  const [students, sessions, current, classesRes] = await Promise.all([
    prisma.student.findMany({
      where: {
        schoolId,
        status: StudentStatus.ACTIVE,
      },
      select: {
        id: true,
        fullName: true,
        admissionNo: true,
        familyId: true,
        family: {
          select: {
            fatherName: true,
            motherName: true,
            primaryPhone: true,
            secondaryPhone: true,
          },
        },
        enrollments: {
          select: {
            classId: true,
            sectionId: true,
            sessionId: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
            session: { select: { id: true, name: true, isCurrent: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    listSessions({ pageSize: 20 }),
    getCurrentSession(),
    listClasses({ pageSize: 100 }),
  ]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Fee Collection</h1>
          <p className="text-sm text-stone-500 mt-0.5">Cashier workstation — search student by name, admission no, or filter by Class & Section</p>
        </div>
      </div>
      <FeeCollectionClient
        classes={classesRes.items.map((c) => ({
          id: c.id,
          name: c.name,
          sections: c.sections.map((sec) => ({ id: sec.id, name: sec.name })),
        }))}
        students={students.map((s) => {
          const currentEnr = s.enrollments.find((e) => e.session.isCurrent) ?? s.enrollments[0];
          return {
            id: s.id,
            fullName: s.fullName,
            admissionNo: s.admissionNo,
            familyId: s.familyId,
            fatherName: s.family?.fatherName ?? null,
            motherName: s.family?.motherName ?? null,
            classId: currentEnr?.classId ?? null,
            sectionId: currentEnr?.sectionId ?? null,
            classLabel: currentEnr ? `${currentEnr.class.name}-${currentEnr.section.name}` : null,
            primaryPhone: s.family?.primaryPhone ?? null,
            secondaryPhone: s.family?.secondaryPhone ?? null,
            enrollments: s.enrollments.map((e) => ({
              classId: e.classId,
              sectionId: e.sectionId,
              sessionId: e.sessionId,
              className: e.class.name,
              sectionName: e.section.name,
              sessionName: e.session.name,
              isCurrent: e.session.isCurrent,
            })),
          };
        })}
        sessions={sessions.items}
        currentSessionId={current?.id ?? null}
        initialStudentId={initialStudentId ?? null}
        returnTo={returnTo ?? null}
        returnLabel={returnLabel ?? null}
      />
    </div>
  );
}
