"use client";

import React from "react";

export interface TCSnapshotData {
  student?: {
    fullName?: string;
    admissionNo?: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    religion?: string | null;
    category?: string | null;
    srNo?: string | null;
    penId?: string | null;
    admissionDate?: string | null;
  };
  family?: {
    fatherName?: string | null;
    motherName?: string | null;
    primaryPhone?: string | null;
  };
  enrollment?: {
    class?: string;
    section?: string;
    session?: string;
    rollNo?: string | null;
  };
  branding?: {
    schoolName?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    udiseCode?: string | null;
    logoDocumentId?: string | null;
    principalName?: string | null;
    principalSignatureDocumentId?: string | null;
  } | null;
  academic?: {
    resultOutcome?: string | null;
  };
}

export interface TCRecord {
  id?: string;
  tcNumber: string;
  status: string;
  dateOfIssue: Date | string;
  attendance?: string | null;
  conduct?: string | null;
  remarks?: string | null;
}

interface TransferCertificateDocumentProps {
  tc: TCRecord;
  snapshot: TCSnapshotData;
  isPrintOnly?: boolean;
}

// ── Date Formatting Helpers ──────────────────────────────────────────────────

const DAYS_IN_WORDS: Record<number, string> = {
  1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth",
  6: "Sixth", 7: "Seventh", 8: "Eighth", 9: "Ninth", 10: "Tenth",
  11: "Eleventh", 12: "Twelfth", 13: "Thirteenth", 14: "Fourteenth", 15: "Fifteenth",
  16: "Sixteenth", 17: "Seventeenth", 18: "Eighteenth", 19: "Nineteenth", 20: "Twentieth",
  21: "Twenty First", 22: "Twenty Second", 23: "Twenty Third", 24: "Twenty Fourth", 25: "Twenty Fifth",
  26: "Twenty Sixth", 27: "Twenty Seventh", 28: "Twenty Eighth", 29: "Twenty Ninth", 30: "Thirtieth",
  31: "Thirty First",
};

const MONTHS_IN_WORDS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const TEENS = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numberToWordsYear(num: number): string {
  if (num < 1000 || num > 2099) return String(num);
  const thousands = "Two Thousand";
  const rest = num % 2000;
  if (rest === 0) return thousands;
  if (rest < 10) return `${thousands} ${ONES[rest]}`;
  if (rest < 20) return `${thousands} ${TEENS[rest - 10]}`;
  const t = Math.floor(rest / 10);
  const o = rest % 10;
  return `${thousands} ${TENS[t]}${o > 0 ? " " + ONES[o] : ""}`;
}

function formatDateInWords(d: Date | string | null | undefined): { digits: string; words: string } {
  if (!d) return { digits: "—", words: "—" };
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return { digits: "—", words: "—" };

  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  const dayPad = String(day).padStart(2, "0");
  const monthPad = String(month + 1).padStart(2, "0");
  const digits = `${dayPad}/${monthPad}/${year}`;

  const dayWord = DAYS_IN_WORDS[day] || String(day);
  const monthWord = MONTHS_IN_WORDS[month] || "";
  const yearWord = numberToWordsYear(year);
  const words = `${dayWord} ${monthWord} ${yearWord}`;

  return { digits, words };
}

function formatClassDisplay(className?: string): string {
  if (!className) return "—";
  const cleaned = className.toUpperCase().replace(/^CLASS\s*/i, "").trim();
  const map: Record<string, string> = {
    "NURSERY": "NURSERY",
    "LKG": "LKG",
    "UKG": "UKG",
    "1": "I (FIRST)", "I": "I (FIRST)",
    "2": "II (SECOND)", "II": "II (SECOND)",
    "3": "III (THIRD)", "III": "III (THIRD)",
    "4": "IV (FOURTH)", "IV": "IV (FOURTH)",
    "5": "V (FIFTH)", "V": "V (FIFTH)",
    "6": "VI (SIXTH)", "VI": "VI (SIXTH)",
    "7": "VII (SEVENTH)", "VII": "VII (SEVENTH)",
    "8": "VIII (EIGHTH)", "VIII": "VIII (EIGHTH)",
    "9": "IX (NINTH)", "IX": "IX (NINTH)",
    "10": "X (TENTH)", "X": "X (TENTH)",
    "11": "XI (ELEVENTH)", "XI": "XI (ELEVENTH)",
    "12": "XII (TWELFTH)", "XII": "XII (TWELFTH)",
  };
  return map[cleaned] || cleaned;
}

// ── School Logo Crest SVG ───────────────────────────────────────────────────

function SchoolCrestLogo({ className = "h-20 w-20" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer 8-pointed / 16-pointed traditional academic star-shield */}
      <polygon
        points="80,8 98,28 124,18 132,44 154,58 148,84 160,108 138,124 134,150 108,150 90,166 68,154 44,162 36,138 12,126 22,100 8,76 28,58 24,32 50,28"
        stroke="#1e3a8a"
        strokeWidth="3.5"
        fill="#f8fafc"
      />
      {/* Inner circular ribbon */}
      <circle cx="80" cy="86" r="48" stroke="#1e3a8a" strokeWidth="2.5" fill="#ffffff" />
      <circle cx="80" cy="86" r="44" stroke="#93c5fd" strokeWidth="1" strokeDasharray="3 2" />
      {/* Top radiant flame / lamp of knowledge */}
      <path d="M74,38 Q80,24 86,38 Q80,32 74,38 Z" fill="#dc2626" />
      <circle cx="80" cy="39" r="3" fill="#f59e0b" />
      {/* Open Book symbol in center */}
      <path
        d="M58,80 Q70,76 80,84 Q90,76 102,80 L102,104 Q90,100 80,108 Q70,100 58,104 Z"
        fill="#1e40af"
        stroke="#1e3a8a"
        strokeWidth="1.5"
      />
      <line x1="80" y1="84" x2="80" y2="108" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M63,88 Q71,85 77,91" stroke="#ffffff" strokeWidth="1" />
      <path d="M63,94 Q71,91 77,97" stroke="#ffffff" strokeWidth="1" />
      <path d="M83,91 Q89,85 97,88" stroke="#ffffff" strokeWidth="1" />
      <path d="M83,97 Q89,91 97,94" stroke="#ffffff" strokeWidth="1" />
      {/* Bottom banner */}
      <path d="M48,124 Q80,132 112,124 L108,136 Q80,144 52,136 Z" fill="#1e3a8a" />
      <text x="80" y="133" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold" fontFamily="serif">VIDYANJALI</text>
    </svg>
  );
}

// ── Main Document Component ─────────────────────────────────────────────────

export function TransferCertificateDocument({
  tc,
  snapshot,
  isPrintOnly = false,
}: TransferCertificateDocumentProps) {
  const student = snapshot.student || {};
  const family = snapshot.family || {};
  const enrollment = snapshot.enrollment || {};
  const branding = snapshot.branding || {};
  const academic = snapshot.academic || {};

  const dobInfo = formatDateInWords(student.dateOfBirth);
  const admissionDateFormatted = student.admissionDate
    ? new Date(student.admissionDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  const issueDateFormatted = tc.dateOfIssue
    ? new Date(tc.dateOfIssue).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  const currentClassFormatted = formatClassDisplay(enrollment.class);
  const isCancelled = tc.status === "CANCELLED";

  // Contact details fallback to official reference defaults
  const schoolPhone = branding.phone || "9811966041 , 7065707702";
  const schoolEmail = branding.email || "vidyanjalipublicschool2007@gmail.com";
  const udiseCode = branding.udiseCode || "09094100078";
  const schoolAddress = branding.address || "Karhera, Mohan Nagar, Ghaziabad,";

  return (
    <div
      className={`tc-document-sheet ${isPrintOnly ? "print-only-sheet" : ""}`}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "200mm",
        margin: "0 auto",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "'Times New Roman', Times, Georgia, serif",
        padding: isPrintOnly ? "0" : "24px 34px 20px 34px",
        boxSizing: "border-box",
        minHeight: isPrintOnly ? "auto" : "auto",
        display: "flex",
        flexDirection: "column",
        lineHeight: "1.3",
      }}
    >
      {/* Cancelled Stamp (if cancelled) */}
      {isCancelled && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 30,
            opacity: 0.12,
            transform: "rotate(-35deg)",
          }}
        >
          <span
            style={{
              fontSize: "72px",
              fontWeight: 900,
              color: "#dc2626",
              border: "12px solid #dc2626",
              padding: "12px 36px",
              textTransform: "uppercase",
              letterSpacing: "4px",
            }}
          >
            CANCELLED
          </span>
        </div>
      )}

      {/* ── TOP SECTION (HEADER + DIVIDER + METADATA) ── */}
      <div style={{ position: "relative", zIndex: 10, width: "100%" }}>
        {/* Header: Logo on Left, School Details Centered */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            marginBottom: "8px",
          }}
        >
          {/* Logo on Left */}
          <div style={{ width: "85px", flexShrink: 0, textAlign: "left" }}>
            {branding.logoDocumentId ? (
              <img
                src={`/api/documents/${branding.logoDocumentId}`}
                alt="School Logo"
                style={{ width: "80px", height: "80px", objectFit: "contain" }}
              />
            ) : (
              <SchoolCrestLogo className="h-20 w-20" />
            )}
          </div>

          {/* School Details Centered */}
          <div style={{ flex: 1, textAlign: "center", paddingRight: "75px" }}>
            {/* School Name: Prominent Blue Serif */}
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#1d4ed8",
                letterSpacing: "0.5px",
                lineHeight: "1.15",
              }}
            >
              {branding.schoolName || "Vidyanjali Public School"}
            </div>
            {/* Address */}
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#000000",
                marginTop: "3px",
              }}
            >
              {schoolAddress}
            </div>
            {/* Govt. Recognised with wavy / accent line (Nursery to VIII removed) */}
            <div
              style={{
                fontSize: "13px",
                fontWeight: 800,
                color: "#b91c1c",
                marginTop: "3px",
                textDecorationColor: "#dc2626",
              }}
            >
              Govt. Recognised
            </div>
          </div>
        </div>

        {/* Solid Horizontal Divider */}
        <div style={{ borderBottom: "1.5px solid #000000", width: "100%", margin: "8px 0 10px 0" }} />

        {/* Ref No. (Left) and U DISE CODE (Right) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "13px",
            fontWeight: 700,
            color: "#000000",
            marginBottom: "12px",
          }}
        >
          <div>
            Ref No. :{" "}
            <span style={{ fontWeight: 800, textDecoration: "underline" }}>
              {tc.tcNumber || "VID/TC/2025-26/021"}
            </span>
          </div>
          <div>
            UDISE CODE :{" "}
            <span style={{ fontWeight: 800 }}>{udiseCode}</span>
          </div>
        </div>

        {/* Title: TRANSFER CERTIFICATE in Bold Red Serif */}
        <div style={{ textAlign: "center", margin: "6px 0 16px 0" }}>
          <span
            style={{
              fontSize: "16px",
              fontWeight: 900,
              color: "#c00000",
              letterSpacing: "1px",
              textTransform: "uppercase",
              borderBottom: "1.5px solid #c00000",
              paddingBottom: "1px",
            }}
          >
            TRANSFER CERTIFICATE
          </span>
        </div>
      </div>

      {/* ── 16 FORMAL NUMBERED ROWS ── */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "9.5px",
          fontSize: "13px",
        }}
      >
        <TCRow number="1" label="Name of Student" value={student.fullName || "—"} />
        <TCRow number="2" label="Father's /Guardian's Name" value={family.fatherName || "—"} />
        <TCRow number="3" label="Mother's Name" value={family.motherName || "—"} />
        <TCRow
          number="4"
          label="Date of Birth (In Figures & words)"
          value={
            dobInfo.digits !== "—"
              ? `${dobInfo.digits} ( ${dobInfo.words} )`
              : "—"
          }
        />
        <TCRow number="5" label="Nationality" value="INDIAN" />
        <TCRow
          number="6"
          label="Religion and Category"
          value={`${(student.religion || "HINDU").toUpperCase()} , ${(student.category || "GENERAL").toUpperCase()}`}
        />
        <TCRow
          number="7"
          label="Date of First Admission & class"
          value={`${admissionDateFormatted} , ${currentClassFormatted}`}
        />
        <TCRow
          number="8"
          label="Admission File no. /S R NO."
          value={`${student.srNo || "03"} / ${student.admissionNo || "593"}`}
        />
        <TCRow number="9" label="PEN NO." value={student.penId || "NA"} />
        <TCRow
          number="10"
          label="Last class studied & Result"
          value={`${currentClassFormatted} , ${(academic.resultOutcome || "PROMOTED").toUpperCase()}`}
        />
        <TCRow
          number="11"
          label="Whether qualified for promotion"
          value={academic.resultOutcome === "Failed" ? "NO" : "YES"}
        />
        <TCRow
          number="12"
          label="Attendance in last Academic year"
          value={tc.attendance || "120 / 218"}
        />
        <TCRow
          number="13"
          label="Code of Conduct"
          value={(tc.conduct || "SATISFACTORY").toUpperCase()}
        />
        <TCRow number="14" label="Whether School Dues Paid" value="YES" />
        <TCRow number="15" label="Date of issue of Certificate" value={issueDateFormatted} />
        <TCRow number="16" label="Remarks (if any)" value={(tc.remarks || "NA").toUpperCase()} />
      </div>

      {/* ── BOTTOM SECTION: DECLARATION, SIGNATURES & CONTACT FOOTER ── */}
      <div style={{ position: "relative", zIndex: 10, width: "100%", marginTop: "22px" }}>
        {/* Declaration Statement */}
        <div
          style={{
            fontSize: "12px",
            lineHeight: "1.4",
            color: "#000000",
            marginBottom: "32px",
          }}
        >
          <span style={{ fontWeight: 800, textDecoration: "underline", marginRight: "6px" }}>
            DECLARATION:
          </span>
          I hereby declare that the above information furnished above is Correct as per School Records
        </div>

        {/* 3-Column Signature Section */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            alignItems: "flex-end",
            textAlign: "center",
            fontSize: "12px",
            fontWeight: 700,
            marginBottom: "18px",
          }}
        >
          {/* Left: Prepared By */}
          <div>
            <div style={{ height: "36px" }} />
            <span>Prepared By</span>
          </div>

          {/* Center: Checked By */}
          <div>
            <div style={{ height: "36px" }} />
            <span>Checked By</span>
          </div>

          {/* Right: Signature Of Principal */}
          <div>
            <div style={{ height: "36px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              {branding.principalSignatureDocumentId && (
                <img
                  src={`/api/documents/${branding.principalSignatureDocumentId}`}
                  alt="Principal Signature"
                  style={{ maxHeight: "36px", objectFit: "contain" }}
                />
              )}
            </div>
            <span>Signature Of Principal</span>
          </div>
        </div>

        {/* Divider above contact footer */}
        <div style={{ borderTop: "1px solid #000000", width: "100%", marginBottom: "6px" }} />

        {/* Contact Footer: Mobile (Left) and E-mail (Right) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "10.5px",
            fontWeight: 600,
            color: "#1e3a8a",
          }}
        >
          <div>
            Mobile :{" "}
            <span style={{ fontWeight: 700, color: "#1e40af" }}>{schoolPhone}</span>
          </div>
          <div>
            E-mail :{" "}
            <span style={{ fontWeight: 700, color: "#1e40af" }}>{schoolEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Single Row Subcomponent ─────────────────────────────────────────────────

function TCRow({
  number,
  label,
  value,
}: {
  number: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        width: "100%",
        lineHeight: "1.35",
      }}
    >
      {/* S.No */}
      <div style={{ width: "28px", flexShrink: 0, fontWeight: 700 }}>
        {number}
      </div>

      {/* Label */}
      <div style={{ width: "310px", flexShrink: 0, fontWeight: 600 }}>
        {label}
      </div>

      {/* Colon */}
      <div style={{ width: "20px", flexShrink: 0, textAlign: "center", fontWeight: 700 }}>
        :
      </div>

      {/* Value */}
      <div
        style={{
          flex: 1,
          fontWeight: 800,
          textTransform: "uppercase",
          wordBreak: "break-word",
          letterSpacing: "0.2px",
          color: "#000000",
        }}
      >
        {value}
      </div>
    </div>
  );
}
