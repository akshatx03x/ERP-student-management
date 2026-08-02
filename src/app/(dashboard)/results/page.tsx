import { requirePermission } from "@/server/permissions/guard";
import { prisma } from "@/server/lib/prisma";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { ResultsClient } from "./results-client";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string; classId?: string; sectionId?: string }>;
}) {
  const params = await searchParams;
  const { user } = await requirePermission("result.view");
  const schoolId = schoolIdFromUser(user);

  // Pre-load Sessions, Classes (with sections) and Global Subjects for modal management
  const [sessions, classes, globalSubjects, examTypes] = await Promise.all([
    prisma.academicSession.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isCurrent: true },
    }),
    prisma.class.findMany({
      where: { schoolId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sections: {
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.subject.findMany({
      where: { schoolId },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.examType.findMany({
      where: { session: { schoolId } },
      orderBy: { name: "asc" },
    }),
  ]);

  const currentSessionId = sessions.find((s) => s.isCurrent)?.id ?? sessions[0]?.id ?? null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-stone-900">Examination & Results</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Manage school subjects, configure exam structure, enter marks, and track student outcomes.
        </p>
      </div>
      <ResultsClient
        sessions={sessions}
        classes={classes}
        globalSubjects={globalSubjects}
        examTypes={examTypes}
        currentSessionId={currentSessionId}
        userRole={user.role}
        preselectedFilters={{
          studentId: params.studentId ?? null,
          classId: params.classId ?? null,
          sectionId: params.sectionId ?? null,
        }}
      />
    </div>
  );
}
