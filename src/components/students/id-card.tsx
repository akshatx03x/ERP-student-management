"use client";

import React from "react";

export interface StudentProps {
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

export interface BrandingProps {
  schoolName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoDocumentId: string | null;
  principalSignatureDocumentId: string | null;
}

export interface IDCardProps {
  student: StudentProps;
  branding: BrandingProps | null;
  selectedSessionId: string;
  zoom?: number;
  className?: string;
  id?: string;
  cardWidth?: number; // default 52mm (5.2cm)
  cardHeight?: number; // default 84mm (8.4cm)
}

// ── School Crest Emblem SVG ─────────────────────────────────────────────────

export function SchoolCrestEmblem({ className = "w-full h-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer star-shield outline matching physical badge */}
      <polygon
        points="80,6 99,26 126,16 134,43 156,58 149,85 160,110 137,125 133,152 106,151 88,166 66,153 42,160 34,136 10,123 20,97 6,73 26,56 22,30 48,27"
        stroke="#1a365d"
        strokeWidth="3.5"
        fill="#ffffff"
      />
      {/* Inner circular boundary */}
      <circle cx="80" cy="86" r="48" stroke="#1a365d" strokeWidth="2.5" fill="#ffffff" />
      <circle cx="80" cy="86" r="44" stroke="#93c5fd" strokeWidth="1" strokeDasharray="3 2" />
      {/* Knowledge flame */}
      <path d="M74,38 Q80,24 86,38 Q80,32 74,38 Z" fill="#dc2626" />
      <circle cx="80" cy="39" r="3" fill="#f59e0b" />
      {/* Open Book symbol in center */}
      <path
        d="M58,80 Q70,76 80,84 Q90,76 102,80 L102,104 Q90,100 80,108 Q70,100 58,104 Z"
        fill="#1e40af"
        stroke="#1a365d"
        strokeWidth="1.5"
      />
      <line x1="80" y1="84" x2="80" y2="108" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M63,88 Q71,85 77,91" stroke="#ffffff" strokeWidth="1" />
      <path d="M63,94 Q71,91 77,97" stroke="#ffffff" strokeWidth="1" />
      <path d="M83,91 Q89,85 97,88" stroke="#ffffff" strokeWidth="1" />
      <path d="M83,97 Q89,91 97,94" stroke="#ffffff" strokeWidth="1" />
      {/* Bottom ribbon banner */}
      <path d="M44,124 Q80,132 116,124 L112,136 Q80,144 48,136 Z" fill="#1a365d" />
      <text x="80" y="133" textAnchor="middle" fill="#ffffff" fontSize="6.5" fontWeight="bold" fontFamily="sans-serif">
        VIDYANJALI
      </text>
    </svg>
  );
}

// ── Formatters ──────────────────────────────────────────────────────────────

function formatDate(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return "—";
  const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatHonorific(name: string | null | undefined, prefix: "Mr." | "Mrs."): string {
  if (!name) return "—";
  const trimmed = name.trim();
  if (/^(mr|mrs|smt|shri|late|dr|prof)\.?\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `${prefix} ${trimmed}`;
}

// ── Main ID Card Component (Single Source of Truth) ──────────────────────────

export function IDCard({
  student,
  branding,
  selectedSessionId,
  zoom = 1,
  className = "",
  id,
  cardWidth = 52, // 5.2 cm
  cardHeight = 84, // 8.4 cm
}: IDCardProps) {
  // Resolve active enrollment
  const enrollment =
    student.enrollments.find((e) => e.sessionId === selectedSessionId) ||
    student.enrollments[0];

  const sessionName = enrollment?.session?.name || "2025-26";
  const gradeName = enrollment?.class?.name || "—";

  // Address assembly
  const addressParts = [];
  if (student.family?.addressLine1) addressParts.push(student.family.addressLine1.trim());
  if (student.family?.addressLine2) addressParts.push(student.family.addressLine2.trim());
  if (student.family?.city) addressParts.push(student.family.city.trim());
  if (student.family?.pincode) addressParts.push(student.family.pincode.trim());
  const fullAddress = addressParts.length > 0 ? addressParts.join(", ") : "—";

  // School contact info
  const schoolName = branding?.schoolName || "Vidyanjali Public School";
  const schoolPhone = branding?.phone || "9811966041, 7065707702";
  const logoUrl = branding?.logoDocumentId ? `/api/documents/${branding.logoDocumentId}` : null;
  const photoUrl = student.photoUrl || null;

  return (
    <div
      id={id}
      data-student-id={student.id}
      className={`student-id-card-root ${className}`}
      style={{
        width: `${cardWidth}mm`,
        height: `${cardHeight}mm`,
        minWidth: `${cardWidth}mm`,
        minHeight: `${cardHeight}mm`,
        maxWidth: `${cardWidth}mm`,
        maxHeight: `${cardHeight}mm`,
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "Arial, Helvetica, sans-serif",
        borderRadius: "2mm",
        border: "1px solid #cbd5e1",
        overflow: "hidden",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        userSelect: "none",
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: "top left",
        boxShadow: zoom !== 1 ? "0 4px 12px rgba(0, 0, 0, 0.12)" : undefined,
      }}
    >
      {/* ── TOP: SCHOOL HEADER ── */}
      <div
        style={{
          padding: "1.5mm 1mm 0.6mm 1mm",
          textAlign: "center",
          backgroundColor: "#ffffff",
        }}
      >
        {/* School Name */}
        <div
          style={{
            fontSize: "11px",
            fontWeight: 900,
            color: "#1a365d",
            letterSpacing: "0.2px",
            lineHeight: "1.15",
            textTransform: "none",
          }}
        >
          {schoolName}
        </div>

        {/* 3-Line Address & Phone Block */}
        <div
          style={{
            fontSize: "6.8px",
            fontWeight: 600,
            color: "#1e293b",
            lineHeight: "1.3",
            marginTop: "0.6mm",
          }}
        >
          <div>Balram Dwar, Karhera, Mohan Nagar,</div>
          <div>Ghaziabad (Uttar Pradesh)</div>
          <div style={{ fontWeight: 700 }}>{schoolPhone}</div>
        </div>
      </div>

      {/* ── STUDENT NAME BAR ── */}
      <div
        style={{
          width: "100%",
          height: "5.5mm",
          backgroundColor: "#1a365d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 1.5mm",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontSize: "9.8px",
            fontWeight: 900,
            color: "#ffffff",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: "normal",
            display: "inline-block",
          }}
        >
          {student.fullName}
        </span>
      </div>

      {/* ── LOGO (LEFT) + STUDENT PHOTO (RIGHT) ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.8mm 3.5mm 0.5mm 3.5mm",
          height: "22mm",
          boxSizing: "border-box",
        }}
      >
        {/* Left: School Crest Logo */}
        <div
          style={{
            width: "18mm",
            height: "20.5mm",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="School Logo"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          ) : (
            <SchoolCrestEmblem className="w-full h-full" />
          )}
        </div>

        {/* Right: Student Photograph */}
        <div
          style={{
            width: "18mm",
            height: "20.5mm",
            border: "1.2px solid #334155",
            borderRadius: "1mm",
            overflow: "hidden",
            backgroundColor: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={student.fullName}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "#64748b",
                fontSize: "6.5px",
                fontWeight: 700,
                textAlign: "center",
                padding: "2px",
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
              <span>NO PHOTO</span>
            </div>
          )}
        </div>
      </div>

      {/* ── STUDENT INFORMATION SECTION (Clean background, no overlay) ── */}
      <div
        style={{
          position: "relative",
          flex: 1,
          padding: "0.8mm 3.5mm 0.8mm 3.5mm",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          boxSizing: "border-box",
          minHeight: "33mm",
          backgroundColor: "#ffffff",
        }}
      >
        {/* 6 Aligned Data Rows */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.1mm",
            fontSize: "9px",
            lineHeight: "1.25",
          }}
        >
          <IDCardRow
            label="F/Name"
            value={formatHonorific(student.family?.fatherName, "Mr.")}
          />
          <IDCardRow
            label="M/Name"
            value={formatHonorific(student.family?.motherName, "Mrs.")}
          />
          <IDCardRow
            label="Grade"
            value={gradeName}
          />
          <IDCardRow
            label="D.O.B."
            value={formatDate(student.dateOfBirth)}
          />
          <IDCardRow
            label="Phone"
            value={student.family?.primaryPhone || "—"}
          />
          <IDCardRow
            label="Address"
            value={fullAddress}
          />
        </div>
      </div>

      {/* ── BOTTOM FOOTER BAR ── */}
      <div
        style={{
          width: "100%",
          height: "4.8mm",
          backgroundColor: "#1a365d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 3.5mm",
          boxSizing: "border-box",
        }}
      >
        {/* Session (Left) */}
        <span
          style={{
            fontSize: "7.8px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "0.3px",
            lineHeight: "normal",
          }}
        >
          {sessionName}
        </span>

        {/* Principal Sign. (Right) */}
        <span
          style={{
            fontSize: "7.8px",
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "0.2px",
            lineHeight: "normal",
          }}
        >
          Principal Sign.
        </span>
      </div>
    </div>
  );
}

// ── Single Aligned Information Row ──────────────────────────────────────────

function IDCardRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        width: "100%",
      }}
    >
      {/* Label */}
      <div
        style={{
          width: "14mm",
          flexShrink: 0,
          fontWeight: 800,
          color: "#0f172a",
          fontSize: "9px",
        }}
      >
        {label}
      </div>

      {/* Colon */}
      <div
        style={{
          width: "2.2mm",
          flexShrink: 0,
          fontWeight: 800,
          textAlign: "center",
          color: "#0f172a",
          fontSize: "9px",
        }}
      >
        :
      </div>

      {/* Value */}
      <div
        style={{
          flex: 1,
          fontWeight: 700,
          color: "#000000",
          fontSize: "9px",
          wordBreak: "break-word",
          overflow: "hidden",
        }}
      >
        {value}
      </div>
    </div>
  );
}
