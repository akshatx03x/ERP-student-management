"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  User, Camera, Upload, X, ExternalLink, ShieldAlert, Phone, MapPin, 
  HeartPulse, Bus, School, Award, Edit2, Trash2, Eye, Loader2, AlertCircle 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateStudentAction } from "@/server/actions/student.actions";
import { uploadDocumentAction } from "@/server/actions/platform.actions";
import { ContactOwner, DocumentOwnerType } from "@prisma/client";

// Modal Component Helper
function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="font-extrabold text-stone-900 text-sm uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Avatar Placeholder Helper
function AvatarPlaceholder({ name, relationship }: { name: string; relationship: string }) {
  const initials = name ? name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase() : relationship[0];
  return (
    <div className="w-full h-full bg-stone-100 flex flex-col items-center justify-center text-stone-400 select-none border border-stone-200 rounded-lg">
      <span className="text-lg font-bold tracking-wide">{initials}</span>
      <span className="text-[11px] uppercase font-bold mt-1 text-stone-405">{relationship}</span>
    </div>
  );
}

interface ProfileClientProps {
  student: any;
  marksData: any;
}

export function StudentProfileClient({ student, marksData }: ProfileClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Extract Guardians
  const fatherGuardian = student.family?.guardians?.find((g: any) => g.gender === "MALE") || 
                         student.guardians?.find((g: any) => g.relationshipType === "FATHER")?.guardian;
  const motherGuardian = student.family?.guardians?.find((g: any) => g.gender === "FEMALE") || 
                         student.guardians?.find((g: any) => g.relationshipType === "MOTHER")?.guardian;

  // Non-parent guardians from StudentGuardian join table
  const nonParentGuardianLinks = student.guardians?.filter(
    (sg: any) => sg.relationshipType !== "FATHER" && sg.relationshipType !== "MOTHER"
  ) || [];

  // Fallback: guardians linked to the family but with no StudentGuardian row for this student
  // (e.g. guardians added via family edit, or students created via older admission flows)
  const linkedGuardianIds = new Set(
    (student.guardians || []).map((sg: any) => sg.guardianId)
  );
  const familyFallbackGuardians = (student.family?.guardians || []).filter(
    (g: any) => !linkedGuardianIds.has(g.id) && g.gender !== "MALE" && g.gender !== "FEMALE"
  );

  const guardian1Link = nonParentGuardianLinks[0];
  const guardian1 = guardian1Link?.guardian || familyFallbackGuardians[0] || undefined;
  const guardian2Link = nonParentGuardianLinks[1];
  const guardian2 = guardian2Link?.guardian || familyFallbackGuardians[1] || undefined;

  const handleOpenModal = (modalType: string, initialData: any) => {
    setFormData(initialData);
    setError(null);
    setActiveModal(modalType);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateStudentAction({ id: student.id, ...formData });
        setActiveModal(null);
        toast.success("Profile section updated successfully");
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Failed to update profile details");
      }
    });
  };

  const handlePhotoUpload = async (
    field: string,
    file: File,
    ownerId: string,
    ownerType: any,
    extraFields?: Record<string, any>,
  ) => {
    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = reader.result as string;
        const splitBase64 = base64String.split(",")[1];

        // 1. Upload file to database documents table
        const doc = await uploadDocumentAction({
          ownerType,
          ownerId,
          type: "OTHER",
          fileName: file.name,
          mimeType: file.type,
          base64: splitBase64,
        });

        // 2. Persist the document URL on the student / guardian record
        const actionPayload = {
          id: student.id,
          [field]: `/api/documents/${doc.id}`,
          ...extraFields,
        };
        await updateStudentAction(actionPayload);

        toast.success("Photo uploaded successfully");
        router.refresh();
      } catch (err: any) {
        toast.error(err.message || "Failed to upload photo");
      } finally {
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoRemove = async (field: string, extraFields?: Record<string, any>) => {
    if (confirm("Are you sure you want to remove this photo?")) {
      try {
        await updateStudentAction({
          id: student.id,
          [field]: null,
          ...extraFields,
        });
        toast.success("Photo removed successfully");
        router.refresh();
      } catch (err: any) {
        toast.error(err.message || "Failed to remove photo");
      }
    }
  };

  const activeEnrollment = student.enrollments?.[0];
  const academicClass = activeEnrollment?.class;
  const classSection = activeEnrollment?.section;
  const currentSession = activeEnrollment?.session;

  return (
    <div className="space-y-6">
      
      {/* 1. STUDENT HERO HEADER OVERVIEW */}
      <Card className="border-stone-200 shadow-sm overflow-hidden bg-white">
        <div className="bg-stone-50/50 border-b border-stone-150 p-6 flex flex-col md:flex-row gap-6 items-center">
          <div className="relative w-28 h-28 shrink-0 rounded-xl overflow-hidden border border-stone-200 shadow-xs bg-white">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.fullName} className="w-full h-full object-cover object-center" />
            ) : (
              <AvatarPlaceholder name={student.fullName} relationship="STUDENT" />
            )}
            <label className="absolute bottom-1 right-1 bg-stone-900/80 hover:bg-stone-900 text-white p-1.5 rounded-lg cursor-pointer transition-colors">
              <Camera className="w-3.5 h-3.5" />
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload("photoUrl", file, student.id, DocumentOwnerType.STUDENT);
                }} 
              />
            </label>
          </div>

          <div className="flex-1 text-center md:text-left space-y-3.5">
            <div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <h2 className="text-2xl font-black text-stone-900">{student.fullName}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                  student.status === "ACTIVE" 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-205" 
                    : "bg-stone-100 text-stone-600 border-stone-250"
                }`}>
                  {student.status}
                </span>
              </div>
              <p className="text-sm text-stone-500 font-semibold mt-1">
                Class {academicClass?.name || "—"} &bull; Section {classSection?.name || "—"} &bull; Roll No {activeEnrollment?.rollNo || "—"}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5 text-[11px] text-stone-500 max-w-4xl border-t pt-3 border-stone-100">
              <div>
                <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-400">Admission No</span>
                <span className="font-bold text-stone-900">{student.admissionNo}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-400">Admission Date</span>
                <span className="font-bold text-stone-900">{student.admissionDate ? new Date(student.admissionDate).toLocaleDateString("en-GB") : "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-400">Academic Session</span>
                <span className="font-bold text-stone-900">{currentSession?.name || "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-400">Date of Birth</span>
                <span className="font-bold text-stone-900">{student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString("en-GB") : "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-400">Gender / Blood Group</span>
                <span className="font-bold text-stone-900 uppercase">{student.gender || "—"} / {student.bloodGroup || "—"}</span>
              </div>
              <div className="flex items-center md:justify-end">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-sm font-bold gap-1 text-stone-600 border-stone-250 hover:bg-stone-50"
                  onClick={() => handleOpenModal("personal", {
                    firstName: student.firstName,
                    middleName: student.middleName || "",
                    lastName: student.lastName || "",
                    gender: student.gender || "",
                    dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().split("T")[0] : "",
                    religion: student.religion || "",
                    category: student.category || "",
                    bloodGroup: student.bloodGroup || "",
                    aadhaar: student.aadhaar || "",
                    apaarId: student.apaarId || "",
                    penId: student.penId || "",
                    srNo: student.srNo || "",
                  })}
                >
                  <Edit2 className="w-3 h-3" /> Edit Overview
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. FAMILY GALLERY (PHOTO-ONLY STORAGE) */}
      <Card className="border-stone-200 shadow-sm bg-white">
        <CardHeader className="bg-stone-50/50 border-b py-3.5">
          <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-stone-500" /> Family Gallery (Photographs)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            
            {/* Father Frame */}
            <div className="space-y-2 text-center">
              <div className="relative aspect-[3/4] w-full max-w-[160px] mx-auto rounded-lg overflow-hidden border border-stone-200 bg-stone-50 flex items-center justify-center">
                {student.family?.fatherPhotoUrl ? (
                  <img src={student.family.fatherPhotoUrl} alt="Father Portrait" className="w-full h-full object-cover object-center" />
                ) : (
                  <AvatarPlaceholder name={student.family?.fatherName || ""} relationship="FATHER" />
                )}
                <div className="absolute bottom-2 right-2 flex gap-1 bg-stone-900/80 p-1 rounded-lg backdrop-blur-xs">
                  <label className="text-white hover:text-stone-200 p-1 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload("fatherPhotoUrl", file, student.familyId, DocumentOwnerType.FAMILY);
                      }} 
                    />
                  </label>
                  {student.family?.fatherPhotoUrl && (
                    <button 
                      onClick={() => handlePhotoRemove("fatherPhotoUrl")}
                      className="text-rose-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="font-bold text-stone-800 text-sm truncate max-w-[160px] mx-auto">{student.family?.fatherName || "—"}</p>
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Father</span>
            </div>

            {/* Mother Frame */}
            <div className="space-y-2 text-center">
              <div className="relative aspect-[3/4] w-full max-w-[160px] mx-auto rounded-lg overflow-hidden border border-stone-200 bg-stone-50 flex items-center justify-center">
                {student.family?.motherPhotoUrl ? (
                  <img src={student.family.motherPhotoUrl} alt="Mother Portrait" className="w-full h-full object-cover object-center" />
                ) : (
                  <AvatarPlaceholder name={student.family?.motherName || ""} relationship="MOTHER" />
                )}
                <div className="absolute bottom-2 right-2 flex gap-1 bg-stone-900/80 p-1 rounded-lg backdrop-blur-xs">
                  <label className="text-white hover:text-stone-200 p-1 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload("motherPhotoUrl", file, student.familyId, DocumentOwnerType.FAMILY);
                      }} 
                    />
                  </label>
                  {student.family?.motherPhotoUrl && (
                    <button 
                      onClick={() => handlePhotoRemove("motherPhotoUrl")}
                      className="text-rose-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="font-bold text-stone-800 text-sm truncate max-w-[160px] mx-auto">{student.family?.motherName || "—"}</p>
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Mother</span>
            </div>

            {/* Guardian 1 Frame */}
            <div className="space-y-2 text-center">
              <div className="relative aspect-[3/4] w-full max-w-[160px] mx-auto rounded-lg overflow-hidden border border-stone-200 bg-stone-50 flex items-center justify-center">
                {guardian1?.photoUrl ? (
                  <img src={guardian1.photoUrl} alt="Guardian 1 Portrait" className="w-full h-full object-cover object-center" />
                ) : (
                  <AvatarPlaceholder name={guardian1?.fullName || ""} relationship="GUARDIAN 1" />
                )}
                <div className="absolute bottom-2 right-2 flex gap-1 bg-stone-900/80 p-1 rounded-lg backdrop-blur-xs">
                  <label className="text-white hover:text-stone-200 p-1 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && guardian1?.id) {
                          handlePhotoUpload("guardian1PhotoUrl", file, student.familyId, DocumentOwnerType.FAMILY, { guardian1Id: guardian1.id });
                        } else if (file && !guardian1?.id) {
                          toast.error("No Guardian 1 is set up. Please add guardian details first via Edit Guardians.");
                        }
                      }} 
                    />
                  </label>
                  {guardian1?.photoUrl && (
                    <button 
                      onClick={() => handlePhotoRemove("guardian1PhotoUrl", { guardian1Id: guardian1?.id })}
                      className="text-rose-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="font-bold text-stone-800 text-sm truncate max-w-[160px] mx-auto">{guardian1?.fullName || "—"}</p>
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                {guardian1Link?.relationshipType || "Guardian 1"}
              </span>
            </div>

            {/* Guardian 2 Frame */}
            <div className="space-y-2 text-center">
              <div className="relative aspect-[3/4] w-full max-w-[160px] mx-auto rounded-lg overflow-hidden border border-stone-200 bg-stone-50 flex items-center justify-center">
                {guardian2?.photoUrl ? (
                  <img src={guardian2.photoUrl} alt="Guardian 2 Portrait" className="w-full h-full object-cover object-center" />
                ) : (
                  <AvatarPlaceholder name={guardian2?.fullName || ""} relationship="GUARDIAN 2" />
                )}
                <div className="absolute bottom-2 right-2 flex gap-1 bg-stone-900/80 p-1 rounded-lg backdrop-blur-xs">
                  <label className="text-white hover:text-stone-200 p-1 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && guardian2?.id) {
                          handlePhotoUpload("guardian2PhotoUrl", file, student.familyId, DocumentOwnerType.FAMILY, { guardian2Id: guardian2.id });
                        } else if (file && !guardian2?.id) {
                          toast.error("No Guardian 2 is set up. Please add guardian details first via Edit Guardians.");
                        }
                      }} 
                    />
                  </label>
                  {guardian2?.photoUrl && (
                    <button 
                      onClick={() => handlePhotoRemove("guardian2PhotoUrl", { guardian2Id: guardian2?.id })}
                      className="text-rose-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="font-bold text-stone-800 text-sm truncate max-w-[160px] mx-auto">{guardian2?.fullName || "—"}</p>
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                {guardian2Link?.relationshipType || "Guardian 2"}
              </span>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 3. ACADEMIC PERFORMANCE (DEEP-LINKED EXAMS STATUS) */}
      <Card className="border-stone-200 shadow-sm bg-white">
        <CardHeader className="bg-stone-50/50 border-b py-3.5">
          <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-indigo-650" /> Academic Exam Outlines
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {marksData && marksData.exams && marksData.exams.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {marksData.exams.map((ex: any) => {
                const hasResult = ex.subjects.some((es: any) =>
                  marksData?.markEntries?.some((me: any) => me.examSubjectId === es.examSubjectId)
                );
                
                return (
                  <div key={ex.id} className="border border-stone-200 rounded-xl p-4 flex flex-col justify-between hover:border-stone-300 transition-all bg-stone-50/30">
                    <div>
                      <h4 className="font-extrabold text-stone-900 text-sm">{ex.name}</h4>
                      <p className="text-[11px] text-stone-500 font-semibold mt-1">
                        Class: {academicClass?.name || "—"} &bull; Term {ex.term}
                      </p>
                      <p className="text-[10px] text-stone-400 font-mono mt-0.5">
                        Session: {currentSession?.name || "—"}
                      </p>
                    </div>
 
                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-stone-400">Exam Status</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${
                          hasResult ? "text-emerald-700" : "text-stone-500"
                        }`}>
                          {hasResult ? "Result Available" : "No Result Available"}
                        </span>
                      </div>
 
                      {hasResult && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-7 text-sm font-bold gap-1 text-indigo-650 border-indigo-200 hover:bg-indigo-50/40"
                          onClick={() => {
                            router.push(`/results?studentId=${student.id}&classId=${academicClass?.id || ""}&sectionId=${classSection?.id || ""}`);
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" /> View Result
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <span className="block text-stone-300 text-2xl">📝</span>
              <p className="text-sm font-bold text-stone-400 mt-1">No Results Published Yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. PARENT DETAILS CARD (TEXT ONLY columns) */}
      <Card className="border-stone-200 shadow-sm bg-white">
        <CardHeader className="bg-stone-50/50 border-b flex flex-row items-center justify-between py-3.5">
          <CardTitle className="text-sm uppercase font-extrabold text-stone-505 tracking-wider flex items-center gap-1.5">
            <User className="w-4 h-4 text-stone-500" /> Father & Mother Information
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-sm text-stone-505 hover:text-stone-850 gap-1"
            onClick={() => handleOpenModal("parentDetails", {
              fatherName: student.family?.fatherName || "",
              fatherQualification: fatherGuardian?.qualification || "",
              fatherOccupation: fatherGuardian?.occupation || "",
              fatherDesignation: fatherGuardian?.designation || "",
              fatherPhone: fatherGuardian?.phone || "",
              fatherWhatsApp: fatherGuardian?.whatsAppNumber || "",
              fatherEmail: fatherGuardian?.email || "",
              fatherAnnualIncome: fatherGuardian?.annualIncome ? Number(fatherGuardian.annualIncome) : "",
              fatherOfficeAddress: fatherGuardian?.officeAddress || "",
              fatherAadhaar: fatherGuardian?.aadhaarNumber || "",

              motherName: student.family?.motherName || "",
              motherQualification: motherGuardian?.qualification || "",
              motherOccupation: motherGuardian?.occupation || "",
              motherDesignation: motherGuardian?.designation || "",
              motherPhone: motherGuardian?.phone || "",
              motherWhatsApp: motherGuardian?.whatsAppNumber || "",
              motherEmail: motherGuardian?.email || "",
              motherAnnualIncome: motherGuardian?.annualIncome ? Number(motherGuardian.annualIncome) : "",
              motherOfficeAddress: motherGuardian?.officeAddress || "",
              motherAadhaar: motherGuardian?.aadhaarNumber || "",
            })}
          >
            <Edit2 className="w-3 h-3" /> Edit Parents
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-stone-150">
            
            {/* Father Details */}
            <div className="space-y-4">
              <h4 className="font-extrabold text-stone-900 text-sm uppercase tracking-wider border-b pb-1.5 text-stone-500">Father details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm text-stone-500">
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Full Name</span>
                  <span className="font-semibold text-stone-900">{student.family?.fatherName || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Mobile Number</span>
                  <span className="font-semibold text-stone-900">{fatherGuardian?.phone || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">WhatsApp Number</span>
                  <span className="font-semibold text-stone-900">{fatherGuardian?.whatsAppNumber || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Email Address</span>
                  <span className="font-semibold text-stone-900">{fatherGuardian?.email || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Profession / Designation</span>
                  <span className="font-semibold text-stone-900">{fatherGuardian?.occupation || "—"} {fatherGuardian?.designation ? `(${fatherGuardian.designation})` : ""}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Qualification</span>
                  <span className="font-semibold text-stone-900">{fatherGuardian?.qualification || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Annual Income</span>
                  <span className="font-semibold text-stone-900">{fatherGuardian?.annualIncome ? `₹${Number(fatherGuardian.annualIncome).toLocaleString()}` : "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Aadhaar Number</span>
                  <span className="font-semibold text-stone-900">{fatherGuardian?.aadhaarNumber || "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Office Address</span>
                  <span className="font-semibold text-stone-900 leading-relaxed">{fatherGuardian?.officeAddress || "—"}</span>
                </div>
              </div>
            </div>

            {/* Mother Details */}
            <div className="space-y-4 md:pl-8">
              <h4 className="font-extrabold text-stone-900 text-sm uppercase tracking-wider border-b pb-1.5 text-stone-500">Mother details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm text-stone-500">
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Full Name</span>
                  <span className="font-semibold text-stone-900">{student.family?.motherName || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Mobile Number</span>
                  <span className="font-semibold text-stone-900">{motherGuardian?.phone || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">WhatsApp Number</span>
                  <span className="font-semibold text-stone-900">{motherGuardian?.whatsAppNumber || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Email Address</span>
                  <span className="font-semibold text-stone-900">{motherGuardian?.email || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Profession / Designation</span>
                  <span className="font-semibold text-stone-900">{motherGuardian?.occupation || "—"} {motherGuardian?.designation ? `(${motherGuardian.designation})` : ""}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Qualification</span>
                  <span className="font-semibold text-stone-900">{motherGuardian?.qualification || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Annual Income</span>
                  <span className="font-semibold text-stone-900">{motherGuardian?.annualIncome ? `₹${Number(motherGuardian.annualIncome).toLocaleString()}` : "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Aadhaar Number</span>
                  <span className="font-semibold text-stone-900">{motherGuardian?.aadhaarNumber || "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Office Address</span>
                  <span className="font-semibold text-stone-900 leading-relaxed">{motherGuardian?.officeAddress || "—"}</span>
                </div>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 5. GUARDIAN DETAILS CARD (TEXT ONLY columns) */}
      <Card className="border-stone-200 shadow-sm bg-white">
        <CardHeader className="bg-stone-50/50 border-b flex flex-row items-center justify-between py-3.5">
          <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-stone-500" /> Guardian Outlines
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-sm text-stone-500 hover:text-stone-855 gap-1"
            onClick={() => handleOpenModal("guardians", {
              guardian1Id: guardian1?.id || "",
              guardian1Name: guardian1?.fullName || "",
              guardian1Relation: guardian1Link?.relationshipType || "LEGAL_GUARDIAN",
              guardian1Phone: guardian1?.phone || "",
              guardian1WhatsApp: guardian1?.whatsAppNumber || "",
              guardian1Occupation: guardian1?.occupation || "",
              guardian1Address: guardian1?.officeAddress || "",

              guardian2Id: guardian2?.id || "",
              guardian2Name: guardian2?.fullName || "",
              guardian2Relation: guardian2Link?.relationshipType || "OTHER",
              guardian2Phone: guardian2?.phone || "",
              guardian2WhatsApp: guardian2?.whatsAppNumber || "",
              guardian2Occupation: guardian2?.occupation || "",
              guardian2Address: guardian2?.officeAddress || "",
            })}
          >
            <Edit2 className="w-3 h-3" /> Edit Guardians
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-stone-150">
            
            {/* Guardian 1 */}
            <div className="space-y-4">
              <h4 className="font-extrabold text-stone-900 text-sm uppercase tracking-wider border-b pb-1.5 text-stone-500">Guardian 1 details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm text-stone-500">
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Full Name</span>
                  <span className="font-semibold text-stone-900">{guardian1?.fullName || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Relation</span>
                  <span className="font-bold text-indigo-700 uppercase">{guardian1Link?.relationshipType || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Mobile Number</span>
                  <span className="font-semibold text-stone-900">{guardian1?.phone || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">WhatsApp Number</span>
                  <span className="font-semibold text-stone-900">{guardian1?.whatsAppNumber || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Occupation</span>
                  <span className="font-semibold text-stone-900">{guardian1?.occupation || "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Address</span>
                  <span className="font-semibold text-stone-900 leading-relaxed">{guardian1?.officeAddress || "—"}</span>
                </div>
              </div>
            </div>

            {/* Guardian 2 */}
            <div className="space-y-4 md:pl-8">
              <h4 className="font-extrabold text-stone-900 text-sm uppercase tracking-wider border-b pb-1.5 text-stone-500">Guardian 2 details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm text-stone-500">
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Full Name</span>
                  <span className="font-semibold text-stone-900">{guardian2?.fullName || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Relation</span>
                  <span className="font-bold text-indigo-700 uppercase">{guardian2Link?.relationshipType || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Mobile Number</span>
                  <span className="font-semibold text-stone-900">{guardian2?.phone || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">WhatsApp Number</span>
                  <span className="font-semibold text-stone-900">{guardian2?.whatsAppNumber || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Occupation</span>
                  <span className="font-semibold text-stone-900">{guardian2?.occupation || "—"}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Address</span>
                  <span className="font-semibold text-stone-900 leading-relaxed">{guardian2?.officeAddress || "—"}</span>
                </div>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 6. CONTACTS & ADDRESSES */}
      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Contact Preferences Card (Reads directly from DB columns) */}
        <Card className="border-stone-200 shadow-sm bg-white">
          <CardHeader className="bg-stone-50/50 border-b flex flex-row items-center justify-between py-3.5">
            <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-stone-500" /> Contact Preferences
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-sm text-stone-500 hover:text-stone-800 gap-1"
              onClick={() => handleOpenModal("contact", {
                primaryPhone: student.family?.primaryPhone || "",
                primaryPhoneBelongsTo: student.family?.primaryPhoneBelongsTo || "FATHER",
                secondaryPhone: student.family?.secondaryPhone || "",
                secondaryPhoneBelongsTo: student.family?.secondaryPhoneBelongsTo || "MOTHER",
              })}
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit Contacts
            </Button>
          </CardHeader>
          <CardContent className="p-6 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] uppercase font-bold text-stone-400">Primary Mobile</span>
                <span className="font-bold text-stone-900 text-sm">{student.family?.primaryPhone || "—"}</span>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 border border-stone-250 font-bold tracking-wide uppercase">
                  {student.family?.primaryPhoneBelongsTo || "FATHER"}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase font-bold text-stone-400">Secondary Mobile</span>
                <span className="font-bold text-stone-900 text-sm">{student.family?.secondaryPhone || "—"}</span>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 border border-stone-250 font-bold tracking-wide uppercase">
                  {student.family?.secondaryPhoneBelongsTo || "MOTHER"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Correspondence vs Permanent Address */}
        <Card className="border-stone-200 shadow-sm bg-white">
          <CardHeader className="bg-stone-50/50 border-b flex flex-row items-center justify-between py-3.5">
            <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-stone-500" /> Address Outlines
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-sm text-stone-500 hover:text-stone-800 gap-1"
              onClick={() => handleOpenModal("address", {
                addressLine1: student.family?.addressLine1 || "",
                addressLine2: student.family?.addressLine2 || "",
                city: student.family?.city || "",
                state: student.family?.state || "",
                pincode: student.family?.pincode || "",
                permAddressLine1: student.family?.permAddressLine1 || "",
                permAddressLine2: student.family?.permAddressLine2 || "",
                permCity: student.family?.permCity || "",
                permState: student.family?.permState || "",
                permPincode: student.family?.permPincode || "",
                sameAsResidential: student.family?.sameAsResidential ?? true,
              })}
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit Addresses
            </Button>
          </CardHeader>
          <CardContent className="p-6 space-y-4 text-sm text-stone-500">
            <div>
              <span className="block text-[11px] uppercase font-bold text-stone-400">Residential Address</span>
              <span className="font-semibold text-stone-850 leading-relaxed">
                {[
                  student.family?.addressLine1,
                  student.family?.addressLine2,
                  student.family?.city,
                  student.family?.state,
                  student.family?.pincode
                ].filter(Boolean).join(", ") || "—"}
              </span>
            </div>
            <div className="border-t pt-3">
              <span className="block text-[11px] uppercase font-bold text-stone-400">Permanent Address</span>
              <span className="font-semibold text-stone-850 leading-relaxed">
                {student.family?.sameAsResidential ? (
                  <span className="italic text-stone-400">Same as residential</span>
                ) : (
                  [
                    student.family?.permAddressLine1,
                    student.family?.permAddressLine2,
                    student.family?.permCity,
                    student.family?.permState,
                    student.family?.permPincode
                  ].filter(Boolean).join(", ") || "—"
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7. MEDICAL & TRANSPORT INFORMATION */}
      <div className="grid md:grid-cols-2 gap-6">
        
        {/* Medical Cards */}
        <Card className="border-stone-200 shadow-sm bg-white">
          <CardHeader className="bg-stone-50/50 border-b flex flex-row items-center justify-between py-3.5">
            <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4 text-rose-600" /> Medical Profile
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-sm text-stone-500 hover:text-stone-800 gap-1"
              onClick={() => handleOpenModal("medical", {
                allergies: student.medical?.allergies || "",
                conditions: student.medical?.conditions || "",
                disability: student.medical?.disability || "",
                emergencyRemarks: student.medical?.emergencyRemarks || "",
              })}
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit Medical
            </Button>
          </CardHeader>
          <CardContent className="p-6 text-sm text-stone-500">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] uppercase font-bold text-stone-400">Blood Group</span>
                <span className="font-bold text-stone-900 text-sm uppercase">{student.bloodGroup || "—"}</span>
              </div>
              <div>
                <span className="block text-[11px] uppercase font-bold text-stone-400">Disability Flag</span>
                <span className="font-semibold text-stone-850">{student.medical?.disability || "None"}</span>
              </div>
              <div className="col-span-2">
                <span className="block text-[11px] uppercase font-bold text-stone-400">Allergies</span>
                <span className="font-semibold text-stone-850">{student.medical?.allergies || "None declared"}</span>
              </div>
              <div className="col-span-2">
                <span className="block text-[11px] uppercase font-bold text-stone-400">Medical Conditions</span>
                <span className="font-semibold text-stone-855">{student.medical?.conditions || "None declared"}</span>
              </div>
              <div className="col-span-2 border-t pt-2.5">
                <span className="block text-[11px] uppercase font-bold text-rose-500">Emergency Remarks</span>
                <span className="font-bold text-rose-700">{student.medical?.emergencyRemarks || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transport Outlines */}
        <Card className="border-stone-200 shadow-sm bg-white">
          <CardHeader className="bg-stone-50/50 border-b flex flex-row items-center justify-between py-3.5">
            <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <Bus className="w-4 h-4 text-emerald-600" /> Transport System
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-sm text-stone-500 hover:text-stone-855 gap-1"
              onClick={() => handleOpenModal("transport", {
                transportRequired: student.transportRequired ?? false,
                transportPickupPoint: student.transportPickupPoint || "",
                transportRoute: student.transportRoute || "",
                transportVehicle: student.transportVehicle || "",
                transportDriver: student.transportDriver || "",
                transportDriverContact: student.transportDriverContact || "",
              })}
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit Transport
            </Button>
          </CardHeader>
          <CardContent className="p-6 text-sm text-stone-500">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[11px] uppercase font-bold text-stone-400">Transport Required</span>
                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${
                  student.transportRequired 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-250" 
                    : "bg-stone-100 text-stone-600 border-stone-250"
                }`}>
                  {student.transportRequired ? "Yes" : "No"}
                </span>
              </div>
              <div>
                <span className="block text-[11px] uppercase font-bold text-stone-400">Pickup Stop</span>
                <span className="font-semibold text-stone-850">{student.transportPickupPoint || "—"}</span>
              </div>
            </div>
            
            {student.transportRequired && (
              <div className="border-t pt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3">
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Route Assigned</span>
                  <span className="font-bold text-stone-905">{student.transportRoute || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Vehicle No</span>
                  <span className="font-bold text-stone-905">{student.transportVehicle || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Driver Name</span>
                  <span className="font-semibold text-stone-855">{student.transportDriver || "—"}</span>
                </div>
                <div>
                  <span className="block text-[11px] uppercase font-bold text-stone-400">Driver Contact</span>
                  <span className="font-semibold text-stone-855">{student.transportDriverContact || "—"}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 8. PREVIOUS SCHOOL OUTLINES */}
      <Card className="border-stone-200 shadow-sm bg-white">
        <CardHeader className="bg-stone-50/50 border-b flex flex-row items-center justify-between py-3.5">
          <CardTitle className="text-sm uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
            <School className="w-4 h-4 text-stone-500" /> Academic Pre-History
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-sm text-stone-500 hover:text-stone-855 gap-1"
            onClick={() => handleOpenModal("previousSchool", {
              previousSchoolName: student.previousSchoolName || "",
              previousClass: student.previousClass || "",
              previousBoard: student.previousBoard || "",
              previousReason: student.previousReason || "",
              tcNumber: student.tcNumber || "",
              tcDate: student.tcDate ? new Date(student.tcDate).toISOString().split("T")[0] : "",
            })}
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit History
          </Button>
        </CardHeader>
        <CardContent className="p-6 text-sm text-stone-500">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="col-span-2">
              <span className="block text-[11px] uppercase font-bold text-stone-400">School Name</span>
              <span className="font-semibold text-stone-900">{student.previousSchoolName || "—"}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase font-bold text-stone-400">Previous Class</span>
              <span className="font-semibold text-stone-900">{student.previousClass || "—"}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase font-bold text-stone-400">Affiliation Board</span>
              <span className="font-semibold text-stone-900">{student.previousBoard || "—"}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase font-bold text-stone-400">Transfer Certificate No</span>
              <span className="font-bold text-stone-900 font-mono">{student.tcNumber || "—"}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase font-bold text-stone-400">TC Issue Date</span>
              <span className="font-semibold text-stone-900">
                {student.tcDate ? new Date(student.tcDate).toLocaleDateString("en-GB") : "—"}
              </span>
            </div>
            <div className="col-span-2 md:col-span-5 border-t pt-3">
              <span className="block text-[11px] uppercase font-bold text-stone-400">Reason for Leaving</span>
              <span className="font-semibold text-stone-850 leading-relaxed">{student.previousReason || "—"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── MODALS FOR PROFILE EDIT SECTIONS ── */}
      
      {/* 1. Edit Overview Modal */}
      <Modal isOpen={activeModal === "personal"} onClose={() => setActiveModal(null)} title="Edit Student Overview">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>First Name</Label>
              <Input 
                required 
                value={formData.firstName || ""} 
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div>
              <Label>Middle Name</Label>
              <Input 
                value={formData.middleName || ""} 
                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
              />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input 
                value={formData.lastName || ""} 
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
            <div>
              <Label>DOB</Label>
              <Input 
                type="date"
                required 
                value={formData.dateOfBirth || ""} 
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              />
            </div>
            <div>
              <Label>Gender</Label>
              <select 
                value={formData.gender || ""} 
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full border rounded p-2 text-sm"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <Label>Blood Group</Label>
              <Input 
                value={formData.bloodGroup || ""} 
                onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Aadhaar Number</Label>
              <Input 
                value={formData.aadhaar || ""} 
                onChange={(e) => setFormData({ ...formData, aadhaar: e.target.value })}
              />
            </div>
            <div>
              <Label>APAAR ID</Label>
              <Input 
                value={formData.apaarId || ""} 
                onChange={(e) => setFormData({ ...formData, apaarId: e.target.value })}
              />
            </div>
            <div>
              <Label>PEN ID</Label>
              <Input 
                value={formData.penId || ""} 
                onChange={(e) => setFormData({ ...formData, penId: e.target.value })}
              />
            </div>
            <div>
              <Label>SR No</Label>
              <Input 
                value={formData.srNo || ""} 
                onChange={(e) => setFormData({ ...formData, srNo: e.target.value })}
              />
            </div>
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save Overview"}</Button>
          </div>
        </form>
      </Modal>

      {/* 2. Edit Parent Details Modal */}
      <Modal isOpen={activeModal === "parentDetails"} onClose={() => setActiveModal(null)} title="Edit Parent details">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <h4 className="font-bold text-sm uppercase text-indigo-700 tracking-wide border-b pb-1">Father details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <Label>Father Name</Label>
                <Input value={formData.fatherName || ""} onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })} />
              </div>
              <div>
                <Label>Mobile Number</Label>
                <Input value={formData.fatherPhone || ""} onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })} />
              </div>
              <div>
                <Label>WhatsApp Number</Label>
                <Input value={formData.fatherWhatsApp || ""} onChange={(e) => setFormData({ ...formData, fatherWhatsApp: e.target.value })} />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input value={formData.fatherEmail || ""} onChange={(e) => setFormData({ ...formData, fatherEmail: e.target.value })} />
              </div>
              <div>
                <Label>Profession</Label>
                <Input value={formData.fatherOccupation || ""} onChange={(e) => setFormData({ ...formData, fatherOccupation: e.target.value })} />
              </div>
              <div>
                <Label>Qualification</Label>
                <Input value={formData.fatherQualification || ""} onChange={(e) => setFormData({ ...formData, fatherQualification: e.target.value })} />
              </div>
              <div>
                <Label>Annual Income (₹)</Label>
                <Input type="number" value={formData.fatherAnnualIncome || ""} onChange={(e) => setFormData({ ...formData, fatherAnnualIncome: Number(e.target.value) || "" })} />
              </div>
              <div>
                <Label>Aadhaar Number</Label>
                <Input value={formData.fatherAadhaar || ""} onChange={(e) => setFormData({ ...formData, fatherAadhaar: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Office Address</Label>
                <Input value={formData.fatherOfficeAddress || ""} onChange={(e) => setFormData({ ...formData, fatherOfficeAddress: e.target.value })} />
              </div>
            </div>

            <h4 className="font-bold text-sm uppercase text-indigo-700 tracking-wide border-b pb-1 pt-3">Mother details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <Label>Mother Name</Label>
                <Input value={formData.motherName || ""} onChange={(e) => setFormData({ ...formData, motherName: e.target.value })} />
              </div>
              <div>
                <Label>Mobile Number</Label>
                <Input value={formData.motherPhone || ""} onChange={(e) => setFormData({ ...formData, motherPhone: e.target.value })} />
              </div>
              <div>
                <Label>WhatsApp Number</Label>
                <Input value={formData.motherWhatsApp || ""} onChange={(e) => setFormData({ ...formData, motherWhatsApp: e.target.value })} />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input value={formData.motherEmail || ""} onChange={(e) => setFormData({ ...formData, motherEmail: e.target.value })} />
              </div>
              <div>
                <Label>Profession</Label>
                <Input value={formData.motherOccupation || ""} onChange={(e) => setFormData({ ...formData, motherOccupation: e.target.value })} />
              </div>
              <div>
                <Label>Qualification</Label>
                <Input value={formData.motherQualification || ""} onChange={(e) => setFormData({ ...formData, motherQualification: e.target.value })} />
              </div>
              <div>
                <Label>Annual Income (₹)</Label>
                <Input type="number" value={formData.motherAnnualIncome || ""} onChange={(e) => setFormData({ ...formData, motherAnnualIncome: Number(e.target.value) || "" })} />
              </div>
              <div>
                <Label>Aadhaar Number</Label>
                <Input value={formData.motherAadhaar || ""} onChange={(e) => setFormData({ ...formData, motherAadhaar: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Office Address</Label>
                <Input value={formData.motherOfficeAddress || ""} onChange={(e) => setFormData({ ...formData, motherOfficeAddress: e.target.value })} />
              </div>
            </div>
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save Parents"}</Button>
          </div>
        </form>
      </Modal>

      {/* 3. Edit Guardians Modal */}
      <Modal isOpen={activeModal === "guardians"} onClose={() => setActiveModal(null)} title="Edit Guardians details">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <h4 className="font-bold text-sm uppercase text-indigo-700 tracking-wide border-b pb-1">Guardian 1 Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <Label>Full Name</Label>
                <Input value={formData.guardian1Name || ""} onChange={(e) => setFormData({ ...formData, guardian1Name: e.target.value })} />
              </div>
              <div>
                <Label>Relation</Label>
                <select 
                  value={formData.guardian1Relation || "LEGAL_GUARDIAN"} 
                  onChange={(e) => setFormData({ ...formData, guardian1Relation: e.target.value })}
                  className="w-full border rounded p-2 text-sm bg-white"
                >
                  <option value="LEGAL_GUARDIAN">Legal Guardian</option>
                  <option value="GRANDPARENT">Grandparent</option>
                  <option value="UNCLE">Uncle</option>
                  <option value="AUNT">Aunt</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <Label>Mobile Number</Label>
                <Input value={formData.guardian1Phone || ""} onChange={(e) => setFormData({ ...formData, guardian1Phone: e.target.value })} />
              </div>
              <div>
                <Label>WhatsApp Number</Label>
                <Input value={formData.guardian1WhatsApp || ""} onChange={(e) => setFormData({ ...formData, guardian1WhatsApp: e.target.value })} />
              </div>
              <div>
                <Label>Occupation</Label>
                <Input value={formData.guardian1Occupation || ""} onChange={(e) => setFormData({ ...formData, guardian1Occupation: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input value={formData.guardian1Address || ""} onChange={(e) => setFormData({ ...formData, guardian1Address: e.target.value })} />
              </div>
            </div>

            <h4 className="font-bold text-sm uppercase text-indigo-700 tracking-wide border-b pb-1 pt-3">Guardian 2 Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <Label>Full Name</Label>
                <Input value={formData.guardian2Name || ""} onChange={(e) => setFormData({ ...formData, guardian2Name: e.target.value })} />
              </div>
              <div>
                <Label>Relation</Label>
                <select 
                  value={formData.guardian2Relation || "OTHER"} 
                  onChange={(e) => setFormData({ ...formData, guardian2Relation: e.target.value })}
                  className="w-full border rounded p-2 text-sm bg-white"
                >
                  <option value="LEGAL_GUARDIAN">Legal Guardian</option>
                  <option value="GRANDPARENT">Grandparent</option>
                  <option value="UNCLE">Uncle</option>
                  <option value="AUNT">Aunt</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <Label>Mobile Number</Label>
                <Input value={formData.guardian2Phone || ""} onChange={(e) => setFormData({ ...formData, guardian2Phone: e.target.value })} />
              </div>
              <div>
                <Label>WhatsApp Number</Label>
                <Input value={formData.guardian2WhatsApp || ""} onChange={(e) => setFormData({ ...formData, guardian2WhatsApp: e.target.value })} />
              </div>
              <div>
                <Label>Occupation</Label>
                <Input value={formData.guardian2Occupation || ""} onChange={(e) => setFormData({ ...formData, guardian2Occupation: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input value={formData.guardian2Address || ""} onChange={(e) => setFormData({ ...formData, guardian2Address: e.target.value })} />
              </div>
            </div>
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save Guardians"}</Button>
          </div>
        </form>
      </Modal>

      {/* 4. Edit Contacts Modal */}
      <Modal isOpen={activeModal === "contact"} onClose={() => setActiveModal(null)} title="Edit Contact preferences">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label>Primary Mobile</Label>
              <Input value={formData.primaryPhone || ""} onChange={(e) => setFormData({ ...formData, primaryPhone: e.target.value })} />
            </div>
            <div>
              <Label>Primary Phone Belongs To</Label>
              <select
                value={formData.primaryPhoneBelongsTo || ""}
                onChange={(e) => setFormData({ ...formData, primaryPhoneBelongsTo: e.target.value as ContactOwner })}
                className="w-full border rounded p-2 text-sm bg-white text-stone-700"
              >
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="GUARDIAN_1">Guardian 1</option>
                <option value="GUARDIAN_2">Guardian 2</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <Label>Secondary Mobile</Label>
              <Input value={formData.secondaryPhone || ""} onChange={(e) => setFormData({ ...formData, secondaryPhone: e.target.value })} />
            </div>
            <div>
              <Label>Secondary Phone Belongs To</Label>
              <select
                value={formData.secondaryPhoneBelongsTo || ""}
                onChange={(e) => setFormData({ ...formData, secondaryPhoneBelongsTo: e.target.value as ContactOwner })}
                className="w-full border rounded p-2 text-sm bg-white text-stone-700"
              >
                <option value="FATHER">Father</option>
                <option value="MOTHER">Mother</option>
                <option value="GUARDIAN_1">Guardian 1</option>
                <option value="GUARDIAN_2">Guardian 2</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save Contacts"}</Button>
          </div>
        </form>
      </Modal>

      {/* 5. Edit Address Modal */}
      <Modal isOpen={activeModal === "address"} onClose={() => setActiveModal(null)} title="Edit Addresses details">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <h4 className="font-bold text-sm uppercase text-stone-500 border-b pb-1">Correspondence Address</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="col-span-2">
                <Label>Address Line 1</Label>
                <Input value={formData.addressLine1 || ""} onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Address Line 2</Label>
                <Input value={formData.addressLine2 || ""} onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })} />
              </div>
              <div>
                <Label>City</Label>
                <Input value={formData.city || ""} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </div>
              <div>
                <Label>State</Label>
                <Input value={formData.state || ""} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
              </div>
              <div>
                <Label>Pincode</Label>
                <Input value={formData.pincode || ""} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t">
              <input 
                type="checkbox" 
                id="sameAsResidential" 
                checked={formData.sameAsResidential ?? true} 
                onChange={(e) => setFormData({ ...formData, sameAsResidential: e.target.checked })} 
                className="w-4 h-4 rounded border-stone-300"
              />
              <Label htmlFor="sameAsResidential" className="text-sm select-none">Permanent Address is same as correspondence</Label>
            </div>

            {!formData.sameAsResidential && (
              <>
                <h4 className="font-bold text-sm uppercase text-stone-500 border-b pb-1 pt-3">Permanent Address</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="col-span-2">
                    <Label>Address Line 1</Label>
                    <Input value={formData.permAddressLine1 || ""} onChange={(e) => setFormData({ ...formData, permAddressLine1: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label>Address Line 2</Label>
                    <Input value={formData.permAddressLine2 || ""} onChange={(e) => setFormData({ ...formData, permAddressLine2: e.target.value })} />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={formData.permCity || ""} onChange={(e) => setFormData({ ...formData, permCity: e.target.value })} />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={formData.permState || ""} onChange={(e) => setFormData({ ...formData, permState: e.target.value })} />
                  </div>
                  <div>
                    <Label>Pincode</Label>
                    <Input value={formData.permPincode || ""} onChange={(e) => setFormData({ ...formData, permPincode: e.target.value })} />
                  </div>
                </div>
              </>
            )}
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save Addresses"}</Button>
          </div>
        </form>
      </Modal>

      {/* 6. Edit Medical Modal */}
      <Modal isOpen={activeModal === "medical"} onClose={() => setActiveModal(null)} title="Edit Medical Profile">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>Allergies</Label>
              <Input value={formData.allergies || ""} onChange={(e) => setFormData({ ...formData, allergies: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Medical Conditions</Label>
              <Input value={formData.conditions || ""} onChange={(e) => setFormData({ ...formData, conditions: e.target.value })} />
            </div>
            <div>
              <Label>Disability Status</Label>
              <Input value={formData.disability || ""} onChange={(e) => setFormData({ ...formData, disability: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Emergency Remarks</Label>
              <Input value={formData.emergencyRemarks || ""} onChange={(e) => setFormData({ ...formData, emergencyRemarks: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save Medical"}</Button>
          </div>
        </form>
      </Modal>

      {/* 7. Edit Transport Modal */}
      <Modal isOpen={activeModal === "transport"} onClose={() => setActiveModal(null)} title="Edit Transport Information">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="transportRequired" 
                checked={formData.transportRequired ?? false} 
                onChange={(e) => setFormData({ ...formData, transportRequired: e.target.checked })} 
                className="w-4 h-4 rounded"
              />
              <Label htmlFor="transportRequired">School Transport Required</Label>
            </div>
            {formData.transportRequired && (
              <>
                <div>
                  <Label>Pickup Stop</Label>
                  <Input value={formData.transportPickupPoint || ""} onChange={(e) => setFormData({ ...formData, transportPickupPoint: e.target.value })} />
                </div>
                <div>
                  <Label>Route Assigned</Label>
                  <Input value={formData.transportRoute || ""} onChange={(e) => setFormData({ ...formData, transportRoute: e.target.value })} />
                </div>
                <div>
                  <Label>Vehicle No</Label>
                  <Input value={formData.transportVehicle || ""} onChange={(e) => setFormData({ ...formData, transportVehicle: e.target.value })} />
                </div>
                <div>
                  <Label>Driver Name</Label>
                  <Input value={formData.transportDriver || ""} onChange={(e) => setFormData({ ...formData, transportDriver: e.target.value })} />
                </div>
                <div>
                  <Label>Driver Phone</Label>
                  <Input value={formData.transportDriverContact || ""} onChange={(e) => setFormData({ ...formData, transportDriverContact: e.target.value })} />
                </div>
              </>
            )}
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save Transport"}</Button>
          </div>
        </form>
      </Modal>

      {/* 8. Edit Previous School Modal */}
      <Modal isOpen={activeModal === "previousSchool"} onClose={() => setActiveModal(null)} title="Edit Previous School outlines">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>School Name</Label>
              <Input value={formData.previousSchoolName || ""} onChange={(e) => setFormData({ ...formData, previousSchoolName: e.target.value })} />
            </div>
            <div>
              <Label>Previous Class</Label>
              <Input value={formData.previousClass || ""} onChange={(e) => setFormData({ ...formData, previousClass: e.target.value })} />
            </div>
            <div>
              <Label>Affiliation Board</Label>
              <Input value={formData.previousBoard || ""} onChange={(e) => setFormData({ ...formData, previousBoard: e.target.value })} />
            </div>
            <div>
              <Label>TC Number</Label>
              <Input value={formData.tcNumber || ""} onChange={(e) => setFormData({ ...formData, tcNumber: e.target.value })} />
            </div>
            <div>
              <Label>TC Date</Label>
              <Input type="date" value={formData.tcDate || ""} onChange={(e) => setFormData({ ...formData, tcDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Reason for Leaving</Label>
              <Input value={formData.previousReason || ""} onChange={(e) => setFormData({ ...formData, previousReason: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-rose-600 flex items-center gap-1 text-sm"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving..." : "Save History"}</Button>
          </div>
        </form>
      </Modal>

      {isUploading && (
        <div className="fixed inset-0 z-[100] bg-stone-900/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white select-none">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
          <p className="text-sm font-extrabold tracking-wide uppercase">Uploading photo, please wait...</p>
        </div>
      )}
    </div>
  );
}
