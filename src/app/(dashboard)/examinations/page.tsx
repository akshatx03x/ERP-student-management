import { listExams, listExamTypes } from "@/server/services/exam.service";
import { listClasses, listSubjects } from "@/server/services/class.service";
import { getCurrentSession, listSessions } from "@/server/services/session.service";
import { listStudents } from "@/server/services/student.service";
import { PageHeader } from "@/components/shared/states";
import { ExaminationsClient } from "./examinations-client";

export default async function ExaminationsPage() {
  const [sessions, current, classes, subjects, students] = await Promise.all([
    listSessions({ pageSize: 20 }),
    getCurrentSession(),
    listClasses({ pageSize: 50 }),
    listSubjects({ pageSize: 100 }),
    listStudents({ pageSize: 200 }),
  ]);
  const sessionId = current?.id ?? sessions.items[0]?.id;
  const [exams, examTypes] = sessionId
    ? await Promise.all([listExams({ sessionId, pageSize: 50 }), listExamTypes(sessionId)])
    : [{ items: [] }, []];

  return (
    <div>
      <PageHeader title="Examinations" description="Exam types, marks entry, and report cards." />
      <ExaminationsClient
        sessions={sessions.items}
        currentSessionId={sessionId ?? null}
        classes={classes.items}
        subjects={subjects.items}
        students={students.items.map((s) => ({ id: s.id, fullName: s.fullName }))}
        exams={"items" in exams ? exams.items : []}
        examTypes={examTypes}
      />
    </div>
  );
}
