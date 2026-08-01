"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Edit3, Eye, FileText } from "lucide-react";
import Link from "next/link";

export function StudentProfileCard({
  student,
  isStudentSelf,
  currentEnrollment,
  siblings = [],
  familyDetails = {} as any,
}: {
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    fullName: string;
    dateOfBirth: string | Date;
    admissionDate?: string | Date | null;
    gender: string | null;
    bloodGroup: string | null;
    aadhaar: string | null;
    religion?: string | null;
    category?: string | null;
    apaarId?: string | null;
    penId?: string | null;
    previousSchoolName?: string | null;
    transportRequired?: boolean;
    transportPickupPoint?: string | null;
    photoDocumentId?: string | null;
    photoUrl?: string | null;
    status: string;
    familyId: string;
    user: { email: string } | null;
  };
  isStudentSelf: boolean;
  currentEnrollment: {
    rollNo: string | null;
    class: { name: string };
    section: { name: string };
    session: { name: string };
  } | null;
  siblings?: any[];
  familyDetails?: {
    fatherName?: string | null;
    motherName?: string | null;
    primaryPhone?: string | null;
    secondaryPhone?: string | null;
    email?: string | null;
  };
}) {
  const initials = student.fullName
    ? student.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "ST";

  const avatarColorClass =
    student.gender === "MALE"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : student.gender === "FEMALE"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : "bg-stone-50 text-stone-700 border-stone-200";

  return (
    <div className="space-y-4">
      {/* ── CARD HEADER CONTROLS ── */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b bg-stone-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div
              className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 text-lg font-bold shadow-xs ${avatarColorClass}`}
            >
              {student.photoUrl ? (
                <img src={student.photoUrl} alt={student.fullName} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900 leading-tight">
                {student.fullName}
              </h2>
              <p className="text-xs text-stone-500 font-medium">
                Adm. <span className="font-bold text-stone-900">{student.admissionNo}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/students/${student.id}/details`}
              className="flex items-center gap-1 px-3 py-1.5 border border-stone-200 text-stone-700 bg-white hover:bg-stone-50 rounded-lg text-xs font-bold transition-all shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5" /> View More
            </Link>
            <Link
              href={`/students/${student.id}/edit`}
              className="flex items-center gap-1 px-3 py-1.5 border border-stone-200 text-stone-700 bg-white hover:bg-stone-50 rounded-lg text-xs font-bold transition-all shadow-2xs"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit Profile
            </Link>
          </div>
        </div>

        {/* ── CARD INFORMATION GRID ── */}
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Gender</span>
              <span className="font-medium text-stone-900">{student.gender || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Date of Birth</span>
              <span className="font-medium text-stone-900">{formatDate(student.dateOfBirth)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Admission Date</span>
              <span className="font-medium text-stone-900">
                {student.admissionDate ? formatDate(student.admissionDate) : "—"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Roll Number</span>
              <span className="font-medium text-stone-900">{currentEnrollment?.rollNo || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Class & Section</span>
              <span className="font-medium text-stone-900">
                {currentEnrollment ? `${currentEnrollment.class.name}-${currentEnrollment.section.name}` : "—"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Academic Session</span>
              <span className="font-medium text-stone-900">{currentEnrollment?.session.name || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">APAAR ID</span>
              <span className="font-medium text-stone-900">{student.apaarId || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">PEN ID</span>
              <span className="font-medium text-stone-900">{student.penId || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Aadhaar Number</span>
              <span className="font-medium text-stone-900">{student.aadhaar || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Blood Group</span>
              <span className="font-medium text-stone-900">{student.bloodGroup || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Primary Contact</span>
              <span className="font-medium text-stone-900">{familyDetails?.primaryPhone || "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-stone-500 mb-0.5">Status</span>
              <Badge variant={student.status === "ACTIVE" ? "success" : "secondary"} className="h-5 px-2 text-[9px] rounded font-bold">
                {student.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* ── RELOCATED SIBLINGS SECTION ── */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 shadow-xs">
        <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-wider mb-3">Linked Family Siblings</h4>
        {siblings.length === 0 ? (
          <div className="text-center py-4 bg-white border border-dashed rounded-xl text-stone-400 font-medium">
            No Linked Siblings
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {siblings.map((s: any) => {
              const enrollment = s.enrollments?.[0];
              const classLabel = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—";
              const sibAvatarInitials = s.fullName
                ? s.fullName.split(" ").map((n: any) => n[0]).join("").slice(0, 2).toUpperCase()
                : "ST";

              const genderClass =
                s.gender === "MALE"
                  ? "bg-blue-50 text-blue-700 border-blue-150"
                  : s.gender === "FEMALE"
                    ? "bg-rose-50 text-rose-700 border-rose-150"
                    : "bg-stone-50 text-stone-700 border-stone-150";

              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl p-3 shadow-sm hover:border-stone-300 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold border ${genderClass}`}>
                      {sibAvatarInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 text-xs truncate">{s.fullName}</p>
                      <p className="text-[9px] text-stone-500">
                        Adm: {s.admissionNo} · {classLabel}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/students/${s.id}`}
                    className="shrink-0 px-2.5 py-1.5 bg-stone-905 hover:bg-stone-850 text-white rounded-lg font-bold text-[9px]"
                  >
                    Open Profile
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
