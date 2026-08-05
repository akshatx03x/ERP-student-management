"use client";

interface StudentProps {
  id: string;
  fullName: string;
  admissionNo: string;
  dateOfBirth: string | Date | null;
  photoUrl: string | null;
  family: {
    fatherName: string | null;
    motherName: string | null;
    primaryPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  } | null;
  enrollments: Array<{
    rollNo: string | null;
    class: { name: string };
    section: { name: string };
    session: { id: string; name: string };
    sessionId: string;
  }>;
}

interface BrandingProps {
  schoolName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoDocumentId: string | null;
  principalSignatureDocumentId: string | null;
}

interface IDCardProps {
  student: StudentProps;
  branding: BrandingProps | null;
  selectedSessionId: string;
  zoom?: number; // scale multiplier, e.g. 1, 1.5, 2
}

export function IDCard({ student, branding, selectedSessionId, zoom = 1 }: IDCardProps) {

  // Find enrollment for selected session or default to the most recent one
  const enrollment =
    student.enrollments.find((e) => e.sessionId === selectedSessionId) ||
    student.enrollments[0];

  const sessionName = enrollment?.session?.name || "Academic Session";
  const className = enrollment ? `${enrollment.class.name}-${enrollment.section.name}` : "—";
  const rollNo = enrollment?.rollNo || "—";

  function formatDate(dateVal: string | Date | null) {
    if (!dateVal) return "—";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // Address assembly
  const addressParts = [];
  if (student.family?.addressLine1) addressParts.push(student.family.addressLine1);
  if (student.family?.addressLine2) addressParts.push(student.family.addressLine2);
  if (student.family?.city) addressParts.push(student.family.city);
  if (student.family?.pincode) addressParts.push(student.family.pincode);
  const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "—";

  // Branding assets
  const logoUrl = branding?.logoDocumentId ? `/api/documents/${branding.logoDocumentId}` : null;
  const signatureUrl = branding?.principalSignatureDocumentId
    ? `/api/documents/${branding.principalSignatureDocumentId}`
    : null;

  return (
    <div
      className="relative flex flex-col bg-white border border-stone-300 shadow-lg text-stone-800 select-none overflow-hidden text-left"
      style={{
        width: "54mm",
        height: "86mm",
        minWidth: "54mm",
        minHeight: "86mm",
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
        borderRadius: "4mm",
      }}
    >
      {/* Subtle school branding watermark in background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none z-0">
        <span className="text-[12px] font-extrabold uppercase rotate-45 text-center leading-tight max-w-[90%] break-words">
          {branding?.schoolName || "ERP SCHOOL"}
        </span>
      </div>

      {/* Header Band */}
      <div className="relative z-10 bg-slate-900 text-white flex flex-col justify-center px-2 py-1.5 border-b border-amber-500 h-[18mm] shrink-0 text-center">
        <div className="flex items-center gap-1.5 justify-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-[8mm] h-[8mm] object-contain rounded-xs" />
          ) : (
            <div className="w-[8mm] h-[8mm] bg-amber-500 text-slate-900 rounded-xs flex items-center justify-center font-bold text-[10px]">
              {(branding?.schoolName || "S").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col text-left overflow-hidden">
            <h1 className="font-extrabold text-[8.5px] leading-tight uppercase truncate max-w-[36mm]">
              {branding?.schoolName || "ERP SCHOOL"}
            </h1>
            <p className="text-[5.5px] leading-normal opacity-90 truncate max-w-[36mm]">
              {branding?.address || "School Campus Address"}
            </p>
            <p className="text-[5px] leading-normal opacity-75 truncate max-w-[36mm]">
              {branding?.phone ? `Ph: ${branding.phone}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Main Card Body */}
      <div className="relative z-10 flex flex-col flex-1 p-2 bg-gradient-to-b from-stone-50 to-white text-[7px] leading-tight">
        {/* Session Badge & Student Photo */}
        <div className="flex gap-2 mb-2 items-start">
          {/* Photo */}
          <div className="w-[18mm] h-[22mm] bg-stone-100 border border-stone-300 rounded-[1mm] overflow-hidden shrink-0 flex items-center justify-center relative shadow-2xs">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.fullName} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center text-stone-400 h-full w-full">
                <span className="text-[12px] font-bold">📷</span>
                <span className="text-[5px] uppercase font-semibold mt-0.5">No Photo</span>
              </div>
            )}
          </div>

          {/* Core Info beside photo */}
          <div className="flex flex-col flex-1 gap-1">
            <span className="bg-amber-100 text-amber-800 font-bold px-1 py-0.5 rounded-xs inline-block text-[5.5px] max-w-fit uppercase border border-amber-200">
              {sessionName}
            </span>
            <div>
              <p className="text-stone-450 uppercase font-extrabold text-[5px]">Admission No</p>
              <p className="font-mono font-bold text-stone-900 text-[8px]">{student.admissionNo}</p>
            </div>
            <div>
              <p className="text-stone-450 uppercase font-extrabold text-[5px]">Class / Sec</p>
              <p className="font-extrabold text-stone-900 text-[8px]">{className}</p>
            </div>
          </div>
        </div>

        {/* Student Name */}
        <div className="mb-1.5 border-b pb-0.5 border-stone-100">
          <p className="text-stone-450 uppercase font-extrabold text-[5px]">Student Name</p>
          <h2 className="font-black text-slate-900 text-[9.5px] uppercase leading-tight truncate">
            {student.fullName}
          </h2>
        </div>

        {/* Details Table */}
        <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <div>
              <span className="text-stone-400 font-medium block">{"Father's Name"}</span>
              <span className="font-semibold text-stone-800 truncate block max-w-full">
                {student.family?.fatherName || "—"}
              </span>
            </div>
            <div>
              <span className="text-stone-400 font-medium block">{"Mother's Name"}</span>
              <span className="font-semibold text-stone-800 truncate block max-w-full">
                {student.family?.motherName || "—"}
              </span>
            </div>
            <div>
              <span className="text-stone-400 font-medium block">Date of Birth</span>
              <span className="font-semibold text-stone-800 block">
                {formatDate(student.dateOfBirth)}
              </span>
            </div>
            <div>
              <span className="text-stone-400 font-medium block">Roll Number</span>
              <span className="font-semibold text-stone-800 block">{rollNo}</span>
            </div>
          </div>

          <div className="mt-1">
            <span className="text-stone-400 font-medium block">Contact Number</span>
            <span className="font-mono font-bold text-stone-800 block">
              {student.family?.primaryPhone || "—"}
            </span>
          </div>

          <div className="mt-1 leading-normal">
            <span className="text-stone-400 font-medium block">Residential Address</span>
            <span className="font-medium text-stone-700 block line-clamp-2 text-[6.5px]">
              {fullAddress}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Band */}
      <div className="relative z-10 bg-stone-50 border-t border-stone-200 px-2 py-1.5 h-[14mm] shrink-0 flex items-center justify-center text-[6px]">
        {/* Principal Signature */}
        <div className="flex flex-col items-center justify-end h-full text-[5px] text-stone-500 font-semibold relative text-center min-w-[28mm]">
          {signatureUrl ? (
            <img
              src={signatureUrl}
              alt="Principal Signature"
              className="absolute bottom-[6px] max-h-[8mm] max-w-[28mm] object-contain select-none"
            />
          ) : (
            <div className="h-[8mm] w-full" />
          )}
          <span className="border-t border-stone-300 w-full pt-0.5 uppercase tracking-wide font-bold">
            Principal Signature
          </span>
        </div>
      </div>
    </div>
  );
}
