import React from "react";

export type ReportCardSubject = {
  id: string;
  name: string;
  code: string;
  type: "SCHOLASTIC" | "CO_SCHOLASTIC";
  isOptional?: boolean;
};

export type ReportCardExam = {
  id: string;
  name: string;
  term: number;
  maxMarks?: number | null;
  passMarks?: number | null;
  subjects: Array<{
    subjectId: string;
    examSubjectId: string;
    maxMarks: number;
    passMarks: number;
  }>;
};

export type ReportCardMarkEntry = {
  examSubjectId: string;
  marksObtained: number | string;
  grade?: string | null;
  remarks?: string | null;
};

export type ReportCardData = {
  sessionName?: string;
  student: {
    id: string;
    fullName: string;
    admissionNo: string;
    rollNo: string;
    classSection: string;
    photoUrl?: string | null;
  };
  schoolBranding?: {
    schoolName?: string;
    address?: string;
    phone?: string;
    logoDocumentId?: string;
  } | null;
  subjects: ReportCardSubject[];
  exams: ReportCardExam[];
  markEntries: ReportCardMarkEntry[];
  termResult?: {
    workingDays?: number | null;
    presentDays?: number | null;
    remarksMid?: string | null;
    remarksFinal?: string | null;
    resultOutcome?: string | null;
    principalRemarks?: string | null;
    gkGrade?: string | null;
    artGrade?: string | null;
    rank?: number | null;
    resultDate?: Date | string | null;
    status?: string | null;
  } | null;
};

export function formatReportCardClassName(rawClassName?: string | null): string {
  if (!rawClassName) return "—";
  let cleaned = rawClassName.trim();
  if (cleaned.includes("-")) {
    cleaned = cleaned.split("-")[0]?.trim() || cleaned;
  }
  // Strip "Class", "Grade", "Std", "Standard" prefixes (case-insensitive)
  cleaned = cleaned.replace(/^(class|grade|std|standard)\s*[:.\-]?\s*/i, "").trim();
  if (/^nursery$/i.test(cleaned)) return "NUR";
  return cleaned || "—";
}

export function parseExcludedSubjectIds(principalRemarks?: string | null): string[] {
  if (!principalRemarks) return [];
  try {
    if (principalRemarks.startsWith("{")) {
      const parsed = JSON.parse(principalRemarks);
      if (Array.isArray(parsed.excludedSubjectIds)) {
        return parsed.excludedSubjectIds;
      }
    } else if (principalRemarks.startsWith("EXCLUDED_SUBJECTS:")) {
      const idsStr = principalRemarks.replace("EXCLUDED_SUBJECTS:", "").split("||")[0];
      return JSON.parse(idsStr);
    }
  } catch {
    // Ignore parse error
  }
  return [];
}

export function parseDualGrade(gradeStr?: string | null): { t1: string; t2: string } {
  if (!gradeStr) return { t1: "—", t2: "—" };
  const str = gradeStr.trim();
  if (str.includes("|")) {
    const [t1, t2] = str.split("|");
    return { t1: t1?.trim() || "—", t2: t2?.trim() || "—" };
  }
  if (str.startsWith("{")) {
    try {
      const obj = JSON.parse(str);
      return { t1: obj.t1 || "—", t2: obj.t2 || "—" };
    } catch {
      // Fallback
    }
  }
  return { t1: str, t2: str };
}

export const isAdditionalSubject = (s: { name: string; type: string }) =>
  s.type === "CO_SCHOLASTIC" ||
  s.name.toUpperCase().includes("GK") ||
  s.name.toUpperCase().includes("GENERAL KNOWLEDGE") ||
  s.name.toUpperCase().includes("DRAW") ||
  s.name.toUpperCase().includes("ART");

export function calculateReportCardTotals(data: ReportCardData, excludedSubjectIds: string[] = []) {
  const term1Exams = data.exams.filter((e) => e.term === 1);
  const term2Exams = data.exams.filter((e) => e.term === 2);

  // Active scholastic subjects only (exclude any deselected optional subjects and additional grade-only subjects)
  const activeScholasticSubjects = data.subjects.filter(
    (s) => s.type === "SCHOLASTIC" && !isAdditionalSubject(s) && !excludedSubjectIds.includes(s.id)
  );

  let t1ScholasticGrandTotal = 0;
  let t1ScholasticMaxPossible = 0;
  let t2ScholasticGrandTotal = 0;
  let t2ScholasticMaxPossible = 0;

  activeScholasticSubjects.forEach((sub) => {
    term1Exams.forEach((ex) => {
      const es = ex.subjects.find((s) => s.subjectId === sub.id);
      if (es) {
        const entry = data.markEntries.find((me) => me.examSubjectId === es.examSubjectId);
        const marks = entry ? (typeof entry.marksObtained === "number" ? entry.marksObtained : Number(entry.marksObtained) || 0) : 0;
        t1ScholasticGrandTotal += marks;
        t1ScholasticMaxPossible += es.maxMarks;
      }
    });

    term2Exams.forEach((ex) => {
      const es = ex.subjects.find((s) => s.subjectId === sub.id);
      if (es) {
        const entry = data.markEntries.find((me) => me.examSubjectId === es.examSubjectId);
        const marks = entry ? (typeof entry.marksObtained === "number" ? entry.marksObtained : Number(entry.marksObtained) || 0) : 0;
        t2ScholasticGrandTotal += marks;
        t2ScholasticMaxPossible += es.maxMarks;
      }
    });
  });

  const finalGrandTotal = t1ScholasticGrandTotal + t2ScholasticGrandTotal;
  const finalMaxPossible = t1ScholasticMaxPossible + t2ScholasticMaxPossible;

  const t1Percentage = t1ScholasticMaxPossible > 0 ? (t1ScholasticGrandTotal / t1ScholasticMaxPossible) * 100 : 0;
  const t2Percentage = t2ScholasticMaxPossible > 0 ? (t2ScholasticGrandTotal / t2ScholasticMaxPossible) * 100 : 0;
  const finalPercentage = finalMaxPossible > 0 ? (finalGrandTotal / finalMaxPossible) * 100 : 0;

  const getGrade = (pct: number) => {
    if (pct >= 90) return "A1";
    if (pct >= 80) return "A2";
    if (pct >= 70) return "B1";
    if (pct >= 60) return "B2";
    if (pct >= 50) return "C1";
    if (pct >= 40) return "C2";
    if (pct >= 33) return "D";
    return "E";
  };

  return {
    t1Total: t1ScholasticGrandTotal,
    t1Max: t1ScholasticMaxPossible,
    t1Pct: Math.round(t1Percentage * 100) / 100,
    t1Grade: getGrade(t1Percentage),

    t2Total: t2ScholasticGrandTotal,
    t2Max: t2ScholasticMaxPossible,
    t2Pct: Math.round(t2Percentage * 100) / 100,
    t2Grade: getGrade(t2Percentage),

    finalGrandTotal,
    finalMaxPossible,
    finalPct: Math.round(finalPercentage * 100) / 100,
    finalGrade: getGrade(finalPercentage),
  };
}

export function ReportCard({
  data,
  excludedSubjectIds: explicitExcludedIds,
  id = "report-card-print",
}: {
  data: ReportCardData;
  excludedSubjectIds?: string[];
  id?: string;
}) {
  if (!data) return null;

  const excludedIds = explicitExcludedIds ?? parseExcludedSubjectIds(data.termResult?.principalRemarks);

  // Filter out any deselected optional subjects
  const visibleSubjects = data.subjects.filter((s) => !excludedIds.includes(s.id));
  const scholasticSubjects = visibleSubjects.filter((s) => s.type === "SCHOLASTIC" && !isAdditionalSubject(s));

  // Check for additional subjects
  const hasGk = visibleSubjects.some(
    (s) => s.name.toLowerCase().includes("gk") || s.name.toLowerCase().includes("general knowledge")
  );
  const hasDraw = visibleSubjects.some(
    (s) => s.name.toLowerCase().includes("draw") || s.name.toLowerCase().includes("art")
  );

  const gkGrades = parseDualGrade(data.termResult?.gkGrade);
  const artGrades = parseDualGrade(data.termResult?.artGrade);

  const totals = calculateReportCardTotals(data, excludedIds);

  const t1Exams = data.exams.filter((e) => e.term === 1);
  const t2Exams = data.exams.filter((e) => e.term === 2);

  const getSubjectMark = (subId: string, examName: string) => {
    const ex = data.exams.find((e) => e.name.toLowerCase() === examName.toLowerCase());
    if (!ex) return "—";
    const es = ex.subjects.find((s) => s.subjectId === subId);
    if (!es) return "—";
    const me = data.markEntries.find((m) => m.examSubjectId === es.examSubjectId);
    if (!me || me.marksObtained === undefined || me.marksObtained === null) return "—";
    return String(me.marksObtained);
  };

  const getSubjectTermData = (subId: string, termExams: ReportCardExam[]) => {
    let sum = 0;
    let max = 0;
    termExams.forEach((ex) => {
      const es = ex.subjects.find((s) => s.subjectId === subId);
      if (es) {
        const me = data.markEntries.find((m) => m.examSubjectId === es.examSubjectId);
        const marks = me ? (typeof me.marksObtained === "number" ? me.marksObtained : Number(me.marksObtained) || 0) : 0;
        sum += marks;
        max += es.maxMarks;
      }
    });

    const pct = max > 0 ? (sum / max) * 100 : 0;
    let grade = "—";
    if (max > 0) {
      if (pct >= 90) grade = "A1";
      else if (pct >= 80) grade = "A2";
      else if (pct >= 70) grade = "B1";
      else if (pct >= 60) grade = "B2";
      else if (pct >= 50) grade = "C1";
      else if (pct >= 40) grade = "C2";
      else if (pct >= 33) grade = "D";
      else grade = "E";
    }

    return { sum, max, grade };
  };

  // Student Section / Class string
  const classParts = data.student.classSection.split("-");
  const rawClassName = classParts[0] || data.student.classSection || "—";
  const formattedClass = formatReportCardClassName(rawClassName);
  const sectionName = classParts[1] || "A";

  // Result date formatted as DD / MM / YYYY
  let formattedResultDate = "14 / 03 / 2026";
  if (data.termResult?.resultDate) {
    try {
      const d = new Date(data.termResult.resultDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        formattedResultDate = `${day} / ${month} / ${year}`;
      }
    } catch {
      // Use fallback
    }
  }

  const attendanceCount = data.termResult?.presentDays ?? 49;

  return (
    <div
      id={id}
      className="bg-white p-4 sm:p-6 w-full max-w-[297mm] shadow-lg flex flex-col justify-between text-black select-none border border-stone-200 print:border-none print:shadow-none print:p-0 print:m-0 print:max-h-[205mm] print:overflow-hidden"
      style={{
        fontFamily: "'Times New Roman', Times, 'Playfair Display', Georgia, serif",
      }}
    >
      {/* Master Outer Table with Crisp Double / Solid Black Border */}
      <table className="w-full border-collapse border-2 border-black text-center text-[10px] text-black">
        <tbody>
          {/* ═══ 1. SCHOOL HEADER ═══ */}
          <tr>
            <td colSpan={16} className="p-3 border-b-2 border-black">
              <div className="flex items-center justify-between relative px-2">
                {/* 1. Left: VPS Diamond Crest Logo */}
                <div className="w-20 h-24 shrink-0 flex items-center justify-center">
                  {data.schoolBranding?.logoDocumentId ? (
                    <img
                      src={`/api/documents/${data.schoolBranding.logoDocumentId}`}
                      alt="Vidyanjali Public School Logo"
                      className="w-18 h-18 object-contain"
                    />
                  ) : (
                    <div className="w-16 h-16 border-2 border-black rotate-45 flex items-center justify-center bg-stone-50">
                      <span className="-rotate-45 font-black text-[10px] tracking-tight">VPS</span>
                    </div>
                  )}
                </div>

                {/* 2. Center: Exact Typography matching user's printed report card */}
                <div className="flex-1 text-center px-4">
                  <h1
                    className="font-extrabold uppercase text-[24px] sm:text-[27px] tracking-[0.14em] text-black leading-tight"
                    style={{
                      fontFamily: "'Cinzel', var(--font-cinzel), 'Times New Roman', 'Playfair Display', serif",
                      letterSpacing: "0.14em",
                      fontWeight: 800,
                    }}
                  >
                    VIDYANJALI PUBLIC SCHOOL
                  </h1>
                  <p className="font-bold text-[12px] sm:text-[13px] tracking-wide text-black mt-1">
                    {data.schoolBranding?.address && data.schoolBranding.address !== "XYZ"
                      ? data.schoolBranding.address
                      : "Karhera Mohan Nagar, Ghaziabad"}
                  </p>
                  <h2 className="font-bold text-[13px] sm:text-[14px] text-black mt-0.5">
                    Annual Assessment Report {data.sessionName || "2025-26"}
                  </h2>
                </div>

                {/* 3. Right: Student Profile Picture */}
                <div className="w-20 h-24 shrink-0 flex flex-col items-center justify-center">
                  {data.student.photoUrl ? (
                    <div className="w-18 h-22 border-2 border-black p-0.5 bg-white shadow-xs">
                      <img
                        src={data.student.photoUrl}
                        alt={data.student.fullName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-18 h-22 border-2 border-black border-dashed flex flex-col items-center justify-center bg-stone-50/50 text-stone-400">
                      <span className="text-[9px] font-bold uppercase tracking-wider">PHOTO</span>
                    </div>
                  )}
                </div>
              </div>
            </td>
          </tr>

          {/* ═══ 2. CANDIDATE INFO BOX ═══ */}
          <tr className="border-b-2 border-black text-left text-[11px] font-bold">
            <td colSpan={7} className="py-2 px-3 border-r border-black">
              <span className="font-bold">Name: </span>
              <span className="font-bold ml-4 uppercase text-black">{data.student.fullName}</span>
            </td>
            <td colSpan={3} className="py-2 px-3 border-r border-black">
              <span className="font-bold">CLASS </span>
              <span className="font-bold ml-2 uppercase text-black">{formattedClass}</span>
            </td>
            <td colSpan={2} className="py-2 px-3 border-r border-black text-center">
              <span className="font-bold uppercase text-black">{sectionName}</span>
            </td>
            <td colSpan={4} className="py-2 px-3 text-right">
              <span className="font-bold">DATE OF RESULT - </span>
              <span className="font-bold text-black">{formattedResultDate}</span>
            </td>
          </tr>

          {/* ═══ 3. MAIN TABLE COLUMN HEADERS (2 Rows) ═══ */}
          <tr className="border-b border-black text-[9px] font-bold uppercase">
            <th rowSpan={2} className="py-2 border-r border-black w-9 text-center">
              S.No.
            </th>
            <th rowSpan={2} className="py-2 px-2.5 text-left border-r border-black w-38">
              SUBJECTS
            </th>
            <th colSpan={5} className="py-1.5 border-r border-black text-center">
              FIRST TERM EVALUATION
            </th>
            <th colSpan={5} className="py-1.5 border-r border-black text-center">
              SECOND TERM EVALUATION
            </th>
            <th rowSpan={2} className="py-2 border-r border-black w-16 text-[8px] leading-tight text-center">
              Total
              <br />
              (1st
              <br />
              Term)
            </th>
            <th rowSpan={2} className="py-2 border-r border-black w-16 text-[8px] leading-tight text-center">
              Total
              <br />
              (2nd
              <br />
              Term)
            </th>
            <th rowSpan={2} className="py-2 border-r border-black w-20 text-[8.5px] leading-tight text-center">
              FINAL TOTAL
              <br />
              (1st Term +
              <br />
              2nd Term)
            </th>
            <th rowSpan={2} className="py-2 w-16 text-[8.5px] leading-tight text-center">
              FINAL
              <br />
              GRADES
            </th>
          </tr>

          {/* Subheaders Row */}
          <tr className="border-b border-black text-[8.5px] font-bold">
            {/* Term 1 */}
            <th className="py-1 border-r border-black w-9 text-center">UT-I</th>
            <th className="py-1 border-r border-black w-9 text-center">UT-II</th>
            <th className="py-1 border-r border-black w-10 text-center">HLY</th>
            <th className="py-1 border-r border-black w-10 text-center">TOTAL</th>
            <th className="py-1 border-r border-black w-8 text-center">GRADE</th>
            {/* Term 2 */}
            <th className="py-1 border-r border-black w-9 text-center">UT-III</th>
            <th className="py-1 border-r border-black w-14 text-center">UT-IV</th>
            <th className="py-1 border-r border-black w-16 text-center">Annual</th>
            <th className="py-1 border-r border-black w-16 text-center">TOTAL</th>
            <th className="py-1 border-r border-black w-14 text-center">GRADE</th>
          </tr>

          {/* ═══ 4. SCHOLASTIC SUBJECT ROWS ═══ */}
          {scholasticSubjects.map((sub, idx) => {
            const t1 = getSubjectTermData(sub.id, t1Exams);
            const t2 = getSubjectTermData(sub.id, t2Exams);

            const grandTotal = t1.sum + t2.sum;
            const grandMax = t1.max + t2.max;
            const grandPct = grandMax > 0 ? (grandTotal / grandMax) * 100 : 0;

            let finalSubGrade = "—";
            if (grandMax > 0) {
              if (grandPct >= 90) finalSubGrade = "A1";
              else if (grandPct >= 80) finalSubGrade = "A2";
              else if (grandPct >= 70) finalSubGrade = "B1";
              else if (grandPct >= 60) finalSubGrade = "B2";
              else if (grandPct >= 50) finalSubGrade = "C1";
              else if (grandPct >= 40) finalSubGrade = "C2";
              else if (grandPct >= 33) finalSubGrade = "D";
              else finalSubGrade = "E";
            }

            return (
              <tr key={sub.id} className="border-b border-black text-black text-[9.5px]">
                <td className="py-1.5 border-r border-black font-bold text-center">{idx + 1}</td>
                <td className="py-1.5 px-3 text-left font-bold border-r border-black">{sub.name}</td>
                {/* T1 */}
                <td className="py-1.5 border-r border-black text-center">{getSubjectMark(sub.id, "UT-I")}</td>
                <td className="py-1.5 border-r border-black text-center">{getSubjectMark(sub.id, "UT-II")}</td>
                <td className="py-1.5 border-r border-black text-center">{getSubjectMark(sub.id, "Half Yearly")}</td>
                <td className="py-1.5 border-r border-black font-bold text-center">{t1.max > 0 ? t1.sum : "—"}</td>
                <td className="py-1.5 border-r border-black font-bold text-center">{t1.grade}</td>
                {/* T2 */}
                <td className="py-1.5 border-r border-black text-center">{getSubjectMark(sub.id, "UT-III")}</td>
                <td className="py-1.5 border-r border-black text-center">{getSubjectMark(sub.id, "UT-IV")}</td>
                <td className="py-1.5 border-r border-black text-center">{getSubjectMark(sub.id, "Annual")}</td>
                <td className="py-1.5 border-r border-black font-bold text-center">{t2.max > 0 ? t2.sum : "—"}</td>
                <td className="py-1.5 border-r border-black font-bold text-center">{t2.grade}</td>
                {/* Grand Summary Columns */}
                <td className="py-1.5 border-r border-black font-bold text-center">{t1.max > 0 ? t1.sum : "—"}</td>
                <td className="py-1.5 border-r border-black font-bold text-center">{t2.max > 0 ? t2.sum : "—"}</td>
                <td className="py-1.5 border-r border-black font-bold text-center">{grandMax > 0 ? grandTotal : "—"}</td>
                <td className="py-1.5 font-bold text-center">{finalSubGrade}</td>
              </tr>
            );
          })}

          {/* ═══ 5. ADDITIONAL SUBJECTS (G.K and DRAW) ═══ */}
          {hasGk && (
            <tr className="border-b border-black text-black text-[9.5px]">
              <td className="py-1.5 border-r border-black font-bold text-center">
                {scholasticSubjects.length + 1}
              </td>
              <td className="py-1.5 px-3 text-left font-bold border-r border-black">G.K</td>
              {/* T1 */}
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="py-1.5 border-r border-black font-bold uppercase text-center">{gkGrades.t1}</td>
              {/* T2 */}
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="py-1.5 border-r border-black font-bold uppercase text-center">{gkGrades.t2}</td>
              {/* Summary columns */}
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="py-1.5 font-bold uppercase text-center">{gkGrades.t2 !== "—" ? gkGrades.t2 : gkGrades.t1}</td>
            </tr>
          )}

          {hasDraw && (
            <tr className="border-b border-black text-black text-[9.5px]">
              <td className="py-1.5 border-r border-black font-bold text-center">
                {scholasticSubjects.length + (hasGk ? 2 : 1)}
              </td>
              <td className="py-1.5 px-3 text-left font-bold border-r border-black">DRAW</td>
              {/* T1 */}
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="py-1.5 border-r border-black font-bold uppercase text-center">{artGrades.t1}</td>
              {/* T2 */}
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="py-1.5 border-r border-black font-bold uppercase text-center">{artGrades.t2}</td>
              {/* Summary columns */}
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="border-r border-black">&nbsp;</td>
              <td className="py-1.5 font-bold uppercase text-center">{artGrades.t2 !== "—" ? artGrades.t2 : artGrades.t1}</td>
            </tr>
          )}

          {/* ═══ 6. SUMMARY ROWS (Grand Total, Percentage, Over all Grades, Attendance) ═══ */}
          {/* Row 1: Grand Total */}
          <tr className="border-b border-black text-black text-[9.5px]">
            <td colSpan={2} className="py-1.5 px-3 text-left font-bold border-r border-black">
              Grand Total
            </td>
            {/* T1 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t1Total}</td>
            <td className="border-r border-black">&nbsp;</td>
            {/* T2 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t2Total}</td>
            <td className="border-r border-black">&nbsp;</td>
            {/* Grand Columns */}
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t1Total}</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t2Total}</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.finalGrandTotal}</td>
            <td>&nbsp;</td>
          </tr>

          {/* Row 2: Percentage */}
          <tr className="border-b border-black text-black text-[9.5px]">
            <td colSpan={2} className="py-1.5 px-3 text-left font-bold border-r border-black">
              Percentage
            </td>
            {/* T1 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t1Pct.toFixed(2)}</td>
            <td className="border-r border-black">&nbsp;</td>
            {/* T2 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t2Pct.toFixed(2)}</td>
            <td className="border-r border-black">&nbsp;</td>
            {/* Grand Columns */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.finalPct.toFixed(2)}</td>
            <td>&nbsp;</td>
          </tr>

          {/* Row 3: Over all Grades */}
          <tr className="border-b border-black text-black text-[9.5px]">
            <td colSpan={2} className="py-1.5 px-3 text-left font-bold border-r border-black">
              Over all Grades
            </td>
            {/* T1 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t1Grade}</td>
            {/* T2 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{totals.t2Grade}</td>
            {/* Grand Columns */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 font-bold text-center">{totals.finalGrade}</td>
          </tr>

          {/* Row 4: Attendance */}
          <tr className="border-b border-black text-black text-[9.5px]">
            <td colSpan={2} className="py-1.5 px-3 text-left font-bold border-r border-black">
              Attendance
            </td>
            {/* T1 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{attendanceCount}</td>
            <td className="border-r border-black">&nbsp;</td>
            {/* T2 */}
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="border-r border-black">&nbsp;</td>
            <td className="py-1.5 border-r border-black font-bold text-center">{attendanceCount}</td>
            <td className="border-r border-black">&nbsp;</td>
            {/* Grand Columns with TOTAL ATT. label */}
            <td colSpan={2} className="py-1.5 border-r border-black font-bold text-center text-[8.5px]">
              TOTAL ATT.
            </td>
            <td className="py-1.5 border-r border-black font-bold text-center">{attendanceCount}</td>
            <td>&nbsp;</td>
          </tr>

          {/* ═══ 7. REMARKS & RESULT OUTCOME (SIDE BY SIDE) ═══ */}
          <tr className="border-b-2 border-black text-left text-[9.5px]">
            {/* Term 1 Remarks: Cols 1-7 */}
            <td className="py-2.5 px-1 border-r border-black font-bold uppercase text-center w-9">
              REMARKS
            </td>
            <td className="py-2.5 px-2 border-r border-black font-bold uppercase text-center w-38">
              MID TERM EVALUATION
            </td>
            <td colSpan={5} className="py-2.5 px-3 border-r border-black">
              <span className="font-normal italic">
                {data.termResult?.remarksMid || "Dear, Give attention towards your studies"}
              </span>
            </td>

            {/* Term 2 Remarks: Cols 8-12 */}
            <td className="py-2.5 px-1 border-r border-black font-bold uppercase text-center w-9">
              REMARKS
            </td>
            <td colSpan={2} className="py-2.5 px-2 border-r border-black font-bold uppercase text-center text-[10px]">
              FINAL TERM EVALUATION
            </td>
            <td colSpan={2} className="py-2.5 px-3 border-r border-black">
              <span className="font-normal">
                {data.termResult?.remarksFinal || "Promoted to Next Class"}
              </span>
            </td>

            {/* Result Outcome: Cols 13-16 (Side-by-Side: RESULT | PASS with generous spacing) */}
            <td
              colSpan={2}
              className="py-2.5 px-2 border-r border-black font-extrabold uppercase text-center text-[11px] tracking-wider bg-stone-50/10"
            >
              RESULT
            </td>
            <td
              colSpan={2}
              className="py-2.5 px-2 font-black uppercase text-center text-[16px] tracking-widest text-black bg-stone-50/20"
            >
              {data.termResult?.resultOutcome || "PASS"}
            </td>
          </tr>

          {/* ═══ 8. SIGNATURES ROW ═══ */}
          <tr className="text-center font-bold text-[9px] uppercase">
            <td colSpan={5} className="py-6 px-3 border-r border-black align-bottom">
              <div className="border-t border-black/40 pt-1.5 w-4/5 mx-auto">CLASS TEACHER SIGNATURE</div>
            </td>
            <td colSpan={6} className="py-6 px-3 border-r border-black align-bottom">
              <div className="border-t border-black/40 pt-1.5 w-4/5 mx-auto">PARENTS SIGNATURE</div>
            </td>
            <td colSpan={5} className="py-6 px-3 align-bottom">
              <div className="h-6"></div>
              <div className="border-t border-black/40 pt-1.5 w-4/5 mx-auto">PRINCIPAL SIGNATURE</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
