import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudent } from "@/server/services/student.service";
import { requirePermission } from "@/server/permissions/guard";
import { PageHeader } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { HeartPulse, ShieldAlert, GraduationCap, FileText, Award, MapPin } from "lucide-react";

export default async function StudentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requirePermission("student.view");
  const student = await getStudent(id).catch(() => null);

  if (!student) notFound();

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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-3">
        <PageHeader
          title="Student Digital Portal"
          description={`Complete academic, family, and medical record for ${student.fullName}`}
        />
        <div className="flex gap-2">
          <Link
            href={`/students/${student.id}/edit`}
            className="text-xs font-bold bg-stone-900 text-white hover:bg-stone-850 px-3.5 py-2 rounded-lg shadow-sm transition-colors"
          >
            Edit
          </Link>
          <Link
            href={`/students/${student.id}`}
            className="text-xs font-bold text-stone-600 hover:text-stone-900 border border-stone-250 px-3.5 py-2 rounded-lg hover:bg-stone-50 transition-colors"
          >
            Back to Profile
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* MEDICAL INFORMATION */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="bg-stone-50/50 border-b">
            <CardTitle className="text-xs uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4 text-rose-600" /> Medical Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">Blood Group</span>
                <span className="font-semibold text-stone-900">{student.bloodGroup || "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">Allergies</span>
                <span className="font-semibold text-stone-900">{student.medical?.allergies || "None declared"}</span>
              </div>
              <div className="col-span-2">
                <span className="block text-[10px] uppercase font-bold text-stone-400">Medical Conditions</span>
                <span className="font-semibold text-stone-900">{student.medical?.conditions || "None declared"}</span>
              </div>
              <div className="col-span-2">
                <span className="block text-[10px] uppercase font-bold text-stone-400">Emergency Notes</span>
                <span className="font-bold text-rose-700">{student.medical?.notes || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GEOGRAPHIC & TRANSPORT */}
        <Card className="border-stone-200 shadow-sm">
          <CardHeader className="bg-stone-50/50 border-b">
            <CardTitle className="text-xs uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" /> Location & Transport
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <span className="block text-[10px] uppercase font-bold text-stone-400">Address</span>
                <span className="font-semibold text-stone-900">{fullAddress}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">Transport Required</span>
                <span className="font-semibold text-stone-900">{student.transportRequired ? "Yes" : "No"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">Pickup Point</span>
                <span className="font-semibold text-stone-900">{student.transportPickupPoint || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PARENTS & GUARDIANS */}
        <Card className="border-stone-200 shadow-sm md:col-span-2">
          <CardHeader className="bg-stone-50/50 border-b">
            <CardTitle className="text-xs uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600" /> Parent & Guardian details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4 divide-y divide-stone-100 text-xs">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="font-black text-stone-700 uppercase text-[10px] mb-2 tracking-wider">Father Information</p>
                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <span className="block text-[9px] uppercase font-bold text-stone-400">Father Name</span>
                    <span className="font-semibold text-stone-900">{family.fatherName || "—"}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="font-black text-stone-700 uppercase text-[10px] mb-2 tracking-wider">Mother Information</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <span className="block text-[9px] uppercase font-bold text-stone-400">Mother Name</span>
                    <span className="font-semibold text-stone-900">{family.motherName || "—"}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase font-bold text-stone-400">Contact</span>
                    <span className="font-semibold text-stone-900">{family.secondaryPhone || "—"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="block text-[9px] uppercase font-bold text-stone-400">Primary Phone</span>
                  <span className="font-semibold text-stone-900">{family.primaryPhone || "—"}</span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase font-bold text-stone-400">Email Address</span>
                  <span className="font-semibold text-stone-905">{family.email || "—"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ACADEMIC HISTORY */}
        <Card className="border-stone-200 shadow-sm md:col-span-2">
          <CardHeader className="bg-stone-50/50 border-b">
            <CardTitle className="text-xs uppercase font-extrabold text-stone-500 tracking-wider flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-indigo-650" /> Previous Academic History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3.5 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">Previous School</span>
                <span className="font-semibold text-stone-900">{student.previousSchoolName || "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">Previous Class</span>
                <span className="font-semibold text-stone-900">{student.previousClass || "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">TC Number</span>
                <span className="font-mono font-semibold text-stone-900">{student.tcNumber || "—"}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-stone-400">TC Date</span>
                <span className="font-semibold text-stone-900">{student.tcDate ? formatDate(student.tcDate) : "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
