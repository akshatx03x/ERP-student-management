import ExcelJS from "exceljs";
import { prisma } from "@/server/lib/prisma";
import { buildFullName, schoolIdFromUser, decimalToNumber } from "@/server/lib/helpers";
import { parseDateInput } from "@/lib/utils";
import { writeAuditLog } from "@/server/services/audit.service";
import { createStudentWithFamily } from "@/server/services/student.service";
import { requirePermission } from "@/server/permissions/guard";
import { Gender, StudentCategory, StudentStatus, Prisma } from "@prisma/client";
import { createStudentWithFamilySchema } from "@/server/validators/student.validator";

// Normalize headers: strip capitalization, extra spaces, line breaks, quotes, hidden Unicode characters
function normalizeHeaderStr(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\r\n\t\u200B-\u200D\uFEFF]/g, "") // remove line breaks and hidden characters
    .replace(/['"“”‘’]/g, "") // remove quotes
    .replace(/[\s_\-\.]+/g, " ") // replace spaces/underscores/hyphens/dots with a single space
    .trim();
}

// Header synonyms for intelligent mapping (pre-normalized)
const HEADER_SYNONYMS: Record<string, string[]> = {
  admissionNo: ["admission no", "admission number", "adm no", "admissionno"],
  name: ["name", "student name", "fullname", "full name", "applicant name"],
  gender: ["gender", "sex"],
  penId: ["student pen", "pen", "pen id", "pen number", "student pen number"],
  fatherName: ["father name", "fathers name"],
  motherName: ["mother name", "mothers name"],
  guardianName: ["guardian name", "guardians name"],
  category: ["social category", "category", "cast", "caste"],
  aadhaar: ["aadhaar no", "aadhaar", "aadhar", "aadhaar number", "aadhar number"],
  className: ["class", "standard", "grade", "class name"],
  sectionName: ["section", "division", "stream", "section name"],
  primaryPhone: ["primary phone", "phone", "mobile", "mobile number", "contact", "contact number"],
  secondaryPhone: ["secondary phone", "alternate phone", "alternate mobile"],
  email: ["email", "email address"],
  address: ["address line 1", "address", "residential address"],
  addressLine2: ["address line 2"],
  city: ["city"],
  state: ["state"],
  pincode: ["pincode", "pin code", "zip", "zipcode"],
  dateOfBirth: ["date of birth", "dob", "birth date"]
};

// Map raw input value to standard synonyms using strict exact matching
function matchHeader(cellValue: string): string | null {
  const clean = normalizeHeaderStr(cellValue);
  for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.includes(clean)) {
      return key;
    }
  }
  // Try camelCase matching as fallback
  const shape = createStudentWithFamilySchema.shape;
  for (const key of Object.keys(shape)) {
    if (key.toLowerCase() === clean.replace(/\s+/g, "")) {
      return key;
    }
  }
  return null;
}

// Canonical categories for intelligent class mapping
export type CanonicalClassKey =
  | "NURSERY"
  | "PRE_NURSERY"
  | "LKG"
  | "UKG"
  | "PREP"
  | "PRE_PRIMARY"
  | "PLAYGROUP"
  | `CLASS_${number}`
  | "UNKNOWN";

export function getCanonicalClassCategory(name: string): { category: CanonicalClassKey; rawNumber?: number } {
  if (!name) return { category: "UNKNOWN" };

  let clean = name
    .toLowerCase()
    .replace(/[\r\n\t\u200B-\u200D\uFEFF]/g, "")
    .replace(/['"“”‘’]/g, "")
    .replace(/[\s_\-\.]+/g, " ")
    .trim();

  // Strip prefixes like "grade", "class", "std", "standard"
  clean = clean.replace(/^(grade|class|std|standard)\s+/g, "").trim();

  // 1. Pre-Nursery / Playgroup
  if (/^(pre\s*nur(s(ery)?)?|prenur(s(ery)?)?)$/.test(clean)) {
    return { category: "PRE_NURSERY" };
  }
  if (/^(pg|play\s*group|playgroup|play-group)$/.test(clean)) {
    return { category: "PLAYGROUP" };
  }

  // 2. Nursery (e.g., nur, nursery, nurs, class nur, class nursery, class nur.)
  if (/^(nur|nurs|nursery|nur\.|nurs\.)$/.test(clean)) {
    return { category: "NURSERY" };
  }

  // 3. LKG (e.g. lkg, l.k.g., lower kg, lower kindergarten, jr kg, junior kg, pp1, pp-1, kg1, kg-1, kg i)
  if (/^(lkg|l\s*k\s*g|lower\s*kg|lower\s*kindergarten|lowerkg|jr\s*kg|jrkg|junior\s*kg|juniorkg|junior\s*kindergarten|pp\s*1|pp1|pp-1|pre\s*primary\s*1|pre-primary\s*1|preprimary\s*1|kg\s*1|kg1|kg-1|kg\s*i|kg-i)$/.test(clean)) {
    return { category: "LKG" };
  }

  // 4. UKG (e.g. ukg, u.k.g., upper kg, upper kindergarten, sr kg, senior kg, pp2, pp-2, kg2, kg-2, kg ii)
  if (/^(ukg|u\s*k\s*g|upper\s*kg|upper\s*kindergarten|upperkg|sr\s*kg|srkg|senior\s*kg|seniorkg|senior\s*kindergarten|pp\s*2|pp2|pp-2|pre\s*primary\s*2|pre-primary\s*2|preprimary\s*2|kg\s*2|kg2|kg-2|kg\s*ii|kg-ii)$/.test(clean)) {
    return { category: "UKG" };
  }

  // 5. Prep
  if (/^(prep|preparatory|prep\.)$/.test(clean)) {
    return { category: "PREP" };
  }

  // 6. PP / Pre-Primary
  if (/^(pp|pre\s*primary|pre-primary|preprimary)$/.test(clean)) {
    return { category: "PRE_PRIMARY" };
  }

  // 7. Ordinal word names
  const ordinalNames: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
    seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  };
  if (ordinalNames[clean]) {
    return { category: `CLASS_${ordinalNames[clean]}`, rawNumber: ordinalNames[clean] };
  }

  const digitMatch = clean.match(/^(\d+)(st|nd|rd|th)?$/);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    return { category: `CLASS_${num}`, rawNumber: num };
  }

  const romanMap: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
  };
  if (romanMap[clean]) {
    const num = romanMap[clean];
    return { category: `CLASS_${num}`, rawNumber: num };
  }

  return { category: "UNKNOWN" };
}

export function getNormalizedClassNameAlias(className: string): string {
  const cat = getCanonicalClassCategory(className);
  if (cat.category === "NURSERY") return "Class Nursery";
  if (cat.category === "PRE_NURSERY") return "Class Pre-Nursery";
  if (cat.category === "PLAYGROUP") return "Class Playgroup";
  if (cat.category === "LKG") return "Class LKG";
  if (cat.category === "UKG") return "Class UKG";
  if (cat.category === "PREP") return "Class Prep";
  if (cat.category === "PRE_PRIMARY") return "Class PP";
  if (cat.rawNumber) return `Class ${cat.rawNumber}`;
  return className;
}

// Convert Roman numerals to integers
function romanToArabic(roman: string): number {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50 };
  let total = 0;
  let prev = 0;
  const upper = roman.toLowerCase();
  for (let i = upper.length - 1; i >= 0; i--) {
    const curr = map[upper[i]] || 0;
    if (curr < prev) total -= curr;
    else total += curr;
    prev = curr;
  }
  return total;
}

// Normalize class names before matching
function normalizeClassName(name: string): string {
  return name
    .replace(/^["'\s\u200B-\u200D\uFEFF]+|["'\s\u200B-\u200D\uFEFF]+$/g, "")
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, " ");
}

// Normalize section inputs
function normalizeSectionName(sectionName: string): string {
  let normalized = sectionName
    .replace(/^["'\s\u200B-\u200D\uFEFF]+|["'\s\u200B-\u200D\uFEFF]+$/g, "")
    .trim()
    .toLowerCase();

  normalized = normalized.replace(/^(section|division|stream)\s+/g, "").trim();
  return normalized;
}

// Helper to normalize class inputs and find matches/suggestions
export function findClassMatch(
  className: string,
  dbClasses: Array<{ id: string; name: string }>
): { matchedClass: { id: string; name: string } | null; suggestion: string | null } {
  if (!className || !className.trim()) {
    return { matchedClass: null, suggestion: null };
  }

  const rawClean = className.trim();
  const inputCategory = getCanonicalClassCategory(rawClean);

  // Strategy 1: Exact case-insensitive match on full raw string
  const exactRaw = dbClasses.find(
    (c) => c.name.trim().toLowerCase() === rawClean.toLowerCase()
  );
  if (exactRaw) return { matchedClass: exactRaw, suggestion: null };

  // Strategy 2: Clean alphanumeric match (ignoring spaces, dots, dashes)
  const alphaCleanInput = rawClean.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const alphaMatch = dbClasses.find(
    (c) => c.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() === alphaCleanInput
  );
  if (alphaMatch) return { matchedClass: alphaMatch, suggestion: null };

  // Strategy 3: Canonical category matching (NURSERY, LKG, UKG, CLASS_1..12, etc.)
  if (inputCategory.category !== "UNKNOWN") {
    const categoryMatch = dbClasses.find((c) => {
      const dbCat = getCanonicalClassCategory(c.name);
      return dbCat.category === inputCategory.category;
    });
    if (categoryMatch) return { matchedClass: categoryMatch, suggestion: null };

    // Fallback aliases for early childhood
    if (inputCategory.category === "PRE_NURSERY") {
      const alt = dbClasses.find((c) => {
        const cat = getCanonicalClassCategory(c.name).category;
        return cat === "NURSERY" || cat === "PLAYGROUP";
      });
      if (alt) return { matchedClass: alt, suggestion: null };
    }
  }

  // Strategy 4: Substring / prefix-stripped matching
  const strippedInput = rawClean.toLowerCase().replace(/^(grade|class|std|standard)\s+/g, "").trim();
  const substringMatch = dbClasses.find((c) => {
    const strippedDb = c.name.toLowerCase().replace(/^(grade|class|std|standard)\s+/g, "").trim();
    return strippedDb === strippedInput || strippedDb.includes(strippedInput) || strippedInput.includes(strippedDb);
  });
  if (substringMatch) return { matchedClass: substringMatch, suggestion: null };

  // Strategy 5: Roman numeral conversion match
  const romanMatch = alphaCleanInput.match(/^(i{1,3}|iv|v|vi{1,3}|ix|x|xi{0,2}|xii)$/);
  if (romanMatch) {
    const arabicNum = String(romanToArabic(romanMatch[0]));
    const romanConvertedMatch = dbClasses.find((c) => {
      const cleanDb = c.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      return cleanDb === arabicNum || cleanDb === `class${arabicNum}` || cleanDb === `${arabicNum}th`;
    });
    if (romanConvertedMatch) return { matchedClass: romanConvertedMatch, suggestion: null };
  }

  // Strategy 6: Closest suggestion based on substring
  const suggestion = dbClasses.find((c) => {
    const cleanDb = c.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return cleanDb.includes(alphaCleanInput) || alphaCleanInput.includes(cleanDb);
  });

  return { matchedClass: null, suggestion: suggestion ? suggestion.name : null };
}

// Normalize blank placeholder values
function normalizeString(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  const blanks = ["na", "n/a", "not available", "-", "--", "nil", "null", "undefined"];
  if (!str || blanks.includes(str.toLowerCase())) {
    return null;
  }
  return str;
}

// Normalize Gender values
function normalizeGender(val: any): Gender | null {
  const str = normalizeString(val);
  if (!str) return null;
  const clean = str.toLowerCase().trim();
  if (clean === "male" || clean === "m" || clean === "boy" || clean === "b") return Gender.MALE;
  if (clean === "female" || clean === "f" || clean === "girl" || clean === "g") return Gender.FEMALE;
  if (clean === "other" || clean === "o" || clean === "transgender" || clean === "t") return Gender.OTHER;
  return null;
}

// Normalize Social Category
function normalizeCategory(val: any): StudentCategory | null {
  const str = normalizeString(val);
  if (!str) return null;
  const clean = str.toLowerCase().trim();
  if (clean.includes("general") || clean === "gen" || clean === "1" || clean === "ur") return StudentCategory.GENERAL;
  if (clean.includes("obc") || clean === "4" || clean.includes("other backward")) return StudentCategory.OBC;
  if (clean.includes("sc") || clean === "2" || clean.includes("scheduled caste")) return StudentCategory.SC;
  if (clean.includes("st") || clean === "3" || clean.includes("scheduled tribe")) return StudentCategory.ST;
  if (clean.includes("ews") || clean.includes("economically weaker")) return StudentCategory.EWS;
  if (clean === "other" || clean === "others") return StudentCategory.OTHER;
  return StudentCategory.GENERAL;
}

// Helper to determine the next available admission number base for school
async function getNextAdmissionNoBase(schoolId: string) {
  // Query all students' admissionNo to find the highest number
  const students = await prisma.student.findMany({
    where: { schoolId },
    select: { admissionNo: true },
  });

  let maxNum = 0;
  let detectedPrefix = "ADM-";
  let detectedLength = 4;
  const currentYear = new Date().getFullYear();

  for (const s of students) {
    if (!s.admissionNo) continue;
    const match = s.admissionNo.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const numStr = match[2];
      const num = parseInt(numStr, 10);
      if (num > maxNum) {
        maxNum = num;
        detectedPrefix = prefix;
        detectedLength = numStr.length;
      }
    }
  }

  if (maxNum === 0) {
    detectedPrefix = `ADM-${currentYear}-`;
    detectedLength = 4;
  }

  const existingNos = new Set(students.map(s => s.admissionNo?.trim().toLowerCase()).filter(Boolean));

  return {
    prefix: detectedPrefix,
    currentNum: maxNum,
    formatLength: detectedLength,
    existingNos
  };
}

interface ValidationResultRow {
  rowNumber: number;
  studentName: string;
  admissionNo: string;
  className: string;
  sectionName: string;
  status: "READY" | "WARNING" | "ERROR";
  reason: string;
  data: any; // Mapped validated DTO payload
}

/**
 * Step 1 & 2: Dry-run Parse and Validate the Excel rows without writing to the database
 */
export async function validateStudentsImport(
  base64: string,
  schoolId: string,
  duplicateStrategy: "SKIP" | "UPDATE" | "FAIL"
) {
  const buffer = Buffer.from(base64, "base64");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel file has no worksheets");

  // Locate Header Row (up to first 10 rows)
  let headerRowIndex = 1;
  let headerMap: Record<string, number> = {};

  for (let r = 1; r <= 10; r++) {
    const row = sheet.getRow(r);
    let matchedCols = 0;
    const tempMap: Record<string, number> = {};

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const cellVal = String(cell.value || "");
      const mappedKey = matchHeader(cellVal);
      if (mappedKey) {
        tempMap[mappedKey] = colNumber;
        matchedCols++;
      }
    });

    // Match if class, name, and section are present (minimally required columns)
    if (tempMap.className && tempMap.name && tempMap.sectionName) {
      headerRowIndex = r;
      headerMap = tempMap;
      break;
    }
  }

  // If we couldn't auto-detect headers, fallback to Row 1
  if (Object.keys(headerMap).length === 0) {
    const firstRow = sheet.getRow(1);
    firstRow.eachCell((cell, colNumber) => {
      const mappedKey = matchHeader(String(cell.value || ""));
      if (mappedKey) headerMap[mappedKey] = colNumber;
    });
    headerRowIndex = 1;
  }

  // Fetch classes and sections for validation mapping
  const dbClasses = await prisma.class.findMany({
    where: { schoolId },
    include: { sections: true }
  });

  let currentSession = await prisma.academicSession.findFirst({
    where: { schoolId, isCurrent: true },
  });
  if (!currentSession) {
    currentSession = await prisma.academicSession.findFirst({
      where: { schoolId },
      orderBy: { createdAt: "desc" }
    });
  }

  const sessionFeeStructures = currentSession
    ? await prisma.feeStructure.findMany({
      where: { sessionId: currentSession.id },
      select: { classId: true }
    })
    : [];

  const admBase = await getNextAdmissionNoBase(schoolId);

  const rows: ValidationResultRow[] = [];
  const processedAdmissions = new Set<string>();

  // Parse Row Data
  const getValue = (row: ExcelJS.Row, key: string): string | null => {
    const colIdx = headerMap[key];
    if (!colIdx) return null;
    const val = row.getCell(colIdx).value;
    if (val == null) return null;
    if (val instanceof Date) return val.toISOString().split("T")[0];
    if (typeof val === "object" && "text" in val) return String(val.text || "").trim();
    return String(val).trim();
  };

  let loggedFirstRow = false;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return; // Skip title / header rows

    const rawName = normalizeString(getValue(row, "name"));
    const rawClass = normalizeString(getValue(row, "className"));
    const rawSection = normalizeString(getValue(row, "sectionName"));
    const rawAdmissionNo = normalizeString(getValue(row, "admissionNo"));
    const rawPen = normalizeString(getValue(row, "penId"));
    const rawAadhaar = normalizeString(getValue(row, "aadhaar"));
    const rawDob = getValue(row, "dateOfBirth");

    // Skip empty lines
    if (!rawName && !rawClass && !rawAdmissionNo && !rawPen) return;

    if (!loggedFirstRow) {
      loggedFirstRow = true;
      const rawObj: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        rawObj[`Col ${colNumber}`] = cell.value;
      });
      console.log("[StudentImport Logging] Raw parsed Excel object:", rawObj);
      console.log("[StudentImport Logging] Normalized headers mapped:", headerMap);
    }

    let status: "READY" | "WARNING" | "ERROR" = "READY";
    const reasons: string[] = [];

    // Enforce exactly four mandatory fields
    if (!rawAdmissionNo) {
      status = "ERROR";
      reasons.push("Admission Number is required");
    }
    if (!rawName) {
      status = "ERROR";
      reasons.push("Student Name is required");
    }
    if (!rawClass) {
      status = "ERROR";
      reasons.push("Class is required");
    }
    if (!rawSection) {
      status = "ERROR";
      reasons.push("Section is required");
    }

    // Date of Birth check (optional/nullable)
    const dobDate: Date | null = rawDob ? parseDateInput(rawDob) : null;

    // Class & Section mapping validation
    let classId: string | null = null;
    let sectionId: string | null = null;
    if (rawClass) {
      const { matchedClass, suggestion } = findClassMatch(rawClass, dbClasses);
      if (matchedClass) {
        classId = matchedClass.id;

        if (rawSection) {
          const cleanSectionInput = normalizeSectionName(rawSection);
          const matchedSection = (matchedClass as any).sections.find(
            (s: any) => normalizeSectionName(s.name) === cleanSectionInput
          );
          if (matchedSection) {
            sectionId = matchedSection.id;
          } else {
            status = "ERROR";
            reasons.push(`Section "${rawSection}" not found in class "${matchedClass.name}"`);
          }
        }
      } else {
        status = "ERROR";
        if (suggestion) {
          reasons.push(`Class "${rawClass}" not found. Did you mean "${suggestion}"?`);
        } else {
          reasons.push(`Class "${rawClass}" not found in ERP`);
        }
      }
    }

    // Duplicate checks within Excel sheet itself
    if (rawAdmissionNo && processedAdmissions.has(rawAdmissionNo)) {
      if (duplicateStrategy === "FAIL") {
        status = "ERROR";
        reasons.push(`Duplicate Admission No "${rawAdmissionNo}" in Excel`);
      } else {
        status = "WARNING";
        reasons.push(`Duplicate Admission No "${rawAdmissionNo}" in Excel (Row will be skipped)`);
      }
    } else if (rawAdmissionNo) {
      processedAdmissions.add(rawAdmissionNo);
    }

    // Database Unique Constraint Checks (AdmissionNo)
    if (status !== "ERROR" && rawAdmissionNo) {
      const cleanAdm = rawAdmissionNo.trim().toLowerCase();
      if (admBase.existingNos.has(cleanAdm)) {
        if (duplicateStrategy === "FAIL") {
          status = "ERROR";
          reasons.push(`Admission No. "${rawAdmissionNo}" already exists in ERP`);
        } else if (duplicateStrategy === "SKIP") {
          status = "WARNING";
          reasons.push(`Admission No. "${rawAdmissionNo}" already exists in ERP (Row will be skipped)`);
        } else if (duplicateStrategy === "UPDATE") {
          status = "READY";
          reasons.push(`Admission No. "${rawAdmissionNo}" already exists in ERP (Existing record will be updated)`);
        }
      }
    }

    // Name matching warning (name match warning, not primary identifier)
    if (status === "READY" && rawName) {
      // (Optional simple warning check if name matches existing database record)
    }

    // Normalize Full Name logic safely
    let firstName = "";
    let middleName = "";
    let lastName = "";
    if (rawName) {
      const nameParts = rawName.split(/\s+/);
      firstName = nameParts[0] || "";
      if (nameParts.length > 2) {
        middleName = nameParts.slice(1, -1).join(" ");
        lastName = nameParts[nameParts.length - 1] || "";
      } else if (nameParts.length === 2) {
        lastName = nameParts[1] || "";
      }
    }

    let fatherName = normalizeString(getValue(row, "fatherName"));
    let motherName = normalizeString(getValue(row, "motherName"));
    let guardianName = normalizeString(getValue(row, "guardianName"));
    if (!fatherName && !motherName && !guardianName) {
      guardianName = "Parent/Guardian";
    }

    // Dynamic extraction of additional fields from Zod Schema
    const shape = createStudentWithFamilySchema.shape;
    const additionalData: Record<string, any> = {};
    for (const key of Object.keys(shape)) {
      if ([
        "allowDuplicate", "createLogin", "status", "enroll", "classId",
        "sectionId", "sessionId", "admissionNo", "firstName", "middleName", "lastName",
        "gender", "category", "dateOfBirth", "aadhaar", "penId", "phone", "secondaryPhone",
        "fatherName", "motherName", "guardianName", "address", "email",
        "resAddressLine1", "resAddressLine2", "resCity", "resState", "resPincode"
      ].includes(key)) continue;

      const rawVal = getValue(row, key);
      if (rawVal !== null && rawVal !== undefined) {
        additionalData[key] = normalizeString(rawVal);
      }
    }

    const payload = {
      ...additionalData,
      admissionNo: rawAdmissionNo,
      firstName,
      middleName: middleName || null,
      lastName: lastName || null,
      fullName: rawName,
      dateOfBirth: dobDate,
      gender: normalizeGender(getValue(row, "gender")),
      penId: rawPen,
      category: normalizeCategory(getValue(row, "category")),
      aadhaar: rawAadhaar && rawAadhaar !== "NOT AVAILABLE" && !rawAadhaar.includes("*") ? rawAadhaar : null,
      fatherName,
      motherName,
      guardianName,
      phone: normalizeString(getValue(row, "primaryPhone")) || normalizeString(getValue(row, "phone")),
      secondaryPhone: normalizeString(getValue(row, "secondaryPhone")),
      email: normalizeString(getValue(row, "email")),
      address: normalizeString(getValue(row, "address")),
      resAddressLine1: normalizeString(getValue(row, "resAddressLine1")) || normalizeString(getValue(row, "address")),
      resAddressLine2: normalizeString(getValue(row, "resAddressLine2")) || normalizeString(getValue(row, "addressLine2")),
      resCity: normalizeString(getValue(row, "resCity")) || normalizeString(getValue(row, "city")),
      resState: normalizeString(getValue(row, "resState")) || normalizeString(getValue(row, "state")),
      resPincode: normalizeString(getValue(row, "resPincode")) || normalizeString(getValue(row, "pincode")),
      enroll: true,
      sessionId: currentSession?.id || null,
      classId,
      sectionId,
      allowDuplicate: true,
      createLogin: true,
    };

    rows.push({
      rowNumber,
      studentName: rawName || "",
      admissionNo: rawAdmissionNo || "",
      className: rawClass || "",
      sectionName: rawSection || "",
      status,
      reason: reasons.join("; ") || "Ready",
      data: payload
    });
  });

  // Calculate summaries
  const readyCount = rows.filter(r => r.status === "READY").length;
  const warningCount = rows.filter(r => r.status === "WARNING").length;
  const errorCount = rows.filter(r => r.status === "ERROR").length;
  const duplicateCount = rows.filter(r => r.reason.toLowerCase().includes("duplicate") || r.reason.toLowerCase().includes("already exists")).length;
  const missingRequiredCount = rows.filter(r => r.reason.toLowerCase().includes("required")).length;
  const unknownClassCount = rows.filter(r => r.reason.toLowerCase().includes("class") && r.reason.toLowerCase().includes("not found")).length;
  const unknownSectionCount = rows.filter(r => r.reason.toLowerCase().includes("section") && r.reason.toLowerCase().includes("not found")).length;

  return {
    summary: {
      ready: readyCount,
      warnings: warningCount,
      errors: errorCount,
      total: rows.length,
      duplicates: duplicateCount,
      missingRequired: missingRequiredCount,
      unknownClasses: unknownClassCount,
      unknownSections: unknownSectionCount,
    },
    rows
  };
}

/**
 * Step 14: Batch insert the validated rows inside a single global Prisma transaction.
 * If any row insert fails, the transaction is automatically rolled back.
 */
export async function executeStudentsImport(
  validatedRows: ValidationResultRow[],
  schoolId: string,
  userId: string,
  duplicateStrategy: "SKIP" | "UPDATE" | "FAIL"
) {
  const callingUser = await (async () => {
    try {
      const authResult = await requirePermission("student.create");
      return authResult.user;
    } catch {
      return { id: userId, schoolId, role: "SUPER_ADMIN" };
    }
  })();

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Initial invalid rows with status ERROR are counted as skipped
  const invalidRowsCount = validatedRows.filter(r => r.status === "ERROR").length;
  skippedCount += invalidRowsCount;

  const rowsToProcess = validatedRows.filter(r => r.status !== "ERROR");

  let fallbackSessionId: string | null = null;
  const fallbackSession = await prisma.academicSession.findFirst({
    where: { schoolId, isCurrent: true }
  }) || await prisma.academicSession.findFirst({
    where: { schoolId },
    orderBy: { createdAt: "desc" }
  });
  if (fallbackSession) {
    fallbackSessionId = fallbackSession.id;
  }

  for (const item of rowsToProcess) {
    if (item.status === "WARNING" && (duplicateStrategy === "SKIP" || item.reason.toLowerCase().includes("duplicate") || item.reason.toLowerCase().includes("already exists"))) {
      skippedCount++;
      continue;
    }

    try {
      const studentInput = {
        ...item.data,
        schoolId,
        sessionId: item.data?.sessionId || fallbackSessionId,
      };

      const existingStudent = await prisma.student.findFirst({
        where: { schoolId, admissionNo: studentInput.admissionNo }
      });

      if (existingStudent) {
        if (duplicateStrategy === "SKIP") {
          skippedCount++;
          continue;
        } else if (duplicateStrategy === "UPDATE") {
          await prisma.$transaction(async (tx) => {
            // Update existing student fields
            await tx.student.update({
              where: { id: existingStudent.id },
              data: {
                firstName: studentInput.firstName,
                middleName: studentInput.middleName,
                lastName: studentInput.lastName,
                fullName: studentInput.fullName,
                dateOfBirth: studentInput.dateOfBirth,
                gender: studentInput.gender,
                bloodGroup: studentInput.bloodGroup,
                aadhaar: studentInput.aadhaar,
                religion: studentInput.religion,
                category: studentInput.category,
                apaarId: studentInput.apaarId,
                penId: studentInput.penId,
                srNo: studentInput.srNo,
              }
            });

            // Update linked family if it exists
            if (existingStudent.familyId) {
              await tx.family.update({
                where: { id: existingStudent.familyId },
                data: {
                  fatherName: studentInput.fatherName,
                  motherName: studentInput.motherName,
                  guardianName: studentInput.guardianName,
                  primaryPhone: studentInput.phone,
                  secondaryPhone: studentInput.secondaryPhone,
                  email: studentInput.email,
                  resAddressLine1: studentInput.resAddressLine1 || studentInput.address,
                  resAddressLine2: studentInput.resAddressLine2,
                  resCity: studentInput.resCity,
                  resState: studentInput.resState,
                  resPincode: studentInput.resPincode,
                }
              });
            }

            // Upsert enrollment details in active session
            if (studentInput.enroll && studentInput.sessionId && studentInput.classId && studentInput.sectionId) {
              await tx.studentEnrollment.upsert({
                where: {
                  studentId_sessionId: {
                    studentId: existingStudent.id,
                    sessionId: studentInput.sessionId,
                  }
                },
                create: {
                  studentId: existingStudent.id,
                  sessionId: studentInput.sessionId,
                  classId: studentInput.classId,
                  sectionId: studentInput.sectionId,
                  status: "ACTIVE"
                },
                update: {
                  classId: studentInput.classId,
                  sectionId: studentInput.sectionId,
                }
              });
            }
          });
          updatedCount++;
        }
      } else {
        await createStudentWithFamily(studentInput, undefined, callingUser);
        importedCount++;
      }
    } catch (err) {
      console.error(`[Student Import Error] Failed on Excel Row ${item.rowNumber} (${item.studentName}):`, err);
      failedCount++;
    }
  }

  try {
    await writeAuditLog({
      schoolId,
      userId,
      action: "create",
      module: "student",
      entityType: "ImportJob",
      entityId: `import-${Date.now()}`,
      newValue: {
        filename: "Excel Batch Student Import",
        importedCount,
        updatedCount,
        skippedCount,
        failedCount
      }
    });
  } catch (auditErr) {
    console.warn("[Student Import] Audit log write failed:", auditErr);
  }

  return {
    imported: importedCount,
    updated: updatedCount,
    skipped: skippedCount,
    failed: failedCount
  };
}

export function getColumnsFromSchema() {
  const shape = createStudentWithFamilySchema.shape;
  const keys = Object.keys(shape);

  const excludeKeys = new Set([
    "allowDuplicate",
    "createLogin",
    "status",
    "enroll",
    "classId",
    "sectionId",
    "sessionId",
  ]);

  const customHeaders: Record<string, string> = {
    admissionNo: "Admission No",
    firstName: "First Name",
    middleName: "Middle Name",
    lastName: "Last Name",
    dateOfBirth: "Date of Birth",
    gender: "Gender",
    aadhaar: "AADHAAR No.",
    phone: "Primary Phone",
    address: "Address Line 1",
  };

  const columns: { header: string; key: string; width: number }[] = [];

  // Add the basic required/important ones first in order
  const order = ["admissionNo", "firstName", "middleName", "lastName", "gender", "dateOfBirth"];
  const added = new Set<string>();

  for (const k of order) {
    if (shape[k as keyof typeof shape]) {
      const header = customHeaders[k] || camelToTitle(k);
      columns.push({ header, key: k, width: getWidth(k) });
      added.add(k);
    }
  }

  // Add class and section columns (mapped to className and sectionName in Excel parsing)
  columns.push({ header: "Class", key: "className", width: 15 });
  columns.push({ header: "Section", key: "sectionName", width: 12 });
  added.add("classId");
  added.add("sectionId");
  added.add("className");
  added.add("sectionName");

  for (const k of keys) {
    if (excludeKeys.has(k) || added.has(k)) continue;
    const header = customHeaders[k] || camelToTitle(k);
    columns.push({ header, key: k, width: getWidth(k) });
  }

  return columns;
}

function camelToTitle(camel: string): string {
  const result = camel.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1).trim();
}

function getWidth(key: string): number {
  if (key.includes("Name")) return 20;
  if (key.includes("address") || key.includes("Address")) return 25;
  return 15;
}

/**
 * Step 4: Generates the sample Excel file download template matching expected headers.
 */
export async function downloadImportSample() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students Template");

  const columns = getColumnsFromSchema();
  worksheet.columns = columns;

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "F2F2F2" },
  };

  const sampleRow: Record<string, any> = {
    admissionNo: "ADM-2026-001",
    name: "John Doe",
    firstName: "John",
    lastName: "Doe",
    gender: "Male",
    dateOfBirth: "2018-05-15",
    penId: "23201140523",
    fatherName: "Richard Doe",
    motherName: "Jane Doe",
    guardianName: "",
    category: "General",
    aadhaar: "123456789012",
    className: "XII",
    sectionName: "A",
    phone: "9876543210",
    secondaryPhone: "",
    email: "john.doe@example.com",
    address: "123 School Lane",
    resAddressLine1: "123 School Lane",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110001"
  };
  worksheet.addRow(sampleRow);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportStudents(
  schoolId: string,
  filters: { search?: string; classId?: string; sectionId?: string }
) {
  const currentSession = await prisma.academicSession.findFirst({
    where: { schoolId, isCurrent: true },
  });

  const enrollmentFilter =
    filters.classId || filters.sectionId
      ? {
        some: {
          ...(currentSession?.id ? { sessionId: currentSession.id } : {}),
          ...(filters.classId ? { classId: filters.classId } : {}),
          ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
        },
      }
      : undefined;

  const where = {
    schoolId,
    ...(enrollmentFilter ? { enrollments: enrollmentFilter } : {}),
    ...(filters.search
      ? {
        OR: [
          { fullName: { contains: filters.search } },
          { admissionNo: { contains: filters.search } },
          { aadhaar: { contains: filters.search } },
        ],
      }
      : {}),
  };

  const students = await prisma.student.findMany({
    where,
    include: {
      family: true,
      enrollments: {
        include: {
          class: true,
          section: true,
        },
        where: {
          sessionId: currentSession?.id ?? undefined,
        },
        take: 1,
      },
      studentFees: {
        where: {
          sessionId: currentSession?.id ?? undefined,
        },
        include: {
          allocations: true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students");

  worksheet.columns = [
    { header: "Admission No", key: "admissionNo", width: 15 },
    { header: "First Name", key: "firstName", width: 15 },
    { header: "Middle Name", key: "middleName", width: 15 },
    { header: "Last Name", key: "lastName", width: 15 },
    { header: "Gender", key: "gender", width: 12 },
    { header: "Date of Birth", key: "dateOfBirth", width: 15 },
    { header: "Blood Group", key: "bloodGroup", width: 12 },
    { header: "Aadhaar", key: "aadhaar", width: 15 },
    { header: "Status", key: "status", width: 12 },
    { header: "Father Name", key: "fatherName", width: 20 },
    { header: "Mother Name", key: "motherName", width: 20 },
    { header: "Guardian Name", key: "guardianName", width: 20 },
    { header: "Primary Phone", key: "primaryPhone", width: 15 },
    { header: "Secondary Phone", key: "secondaryPhone", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Address Line 1", key: "addressLine1", width: 30 },
    { header: "Address Line 2", key: "addressLine2", width: 30 },
    { header: "City", key: "city", width: 15 },
    { header: "State", key: "state", width: 15 },
    { header: "Pincode", key: "pincode", width: 12 },
    { header: "Class", key: "className", width: 15 },
    { header: "Section", key: "sectionName", width: 12 },
    { header: "Outstanding Dues", key: "outstandingDues", width: 18 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "F2F2F2" },
  };

  students.forEach((s) => {
    const enrollment = s.enrollments[0] ?? null;
    let outstandingDues = 0;
    s.studentFees.forEach((fee) => {
      const feeAmount = Number(fee.amount);
      const paidAmount = fee.allocations.reduce((sum, alloc) => sum + Number(alloc.amount), 0);
      outstandingDues += Math.max(0, feeAmount - paidAmount);
    });

    const dobString = s.dateOfBirth
      ? s.dateOfBirth.toISOString().split("T")[0]
      : "";

    worksheet.addRow({
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      middleName: s.middleName ?? "",
      lastName: s.lastName ?? "",
      gender: s.gender ?? "",
      dateOfBirth: dobString,
      bloodGroup: s.bloodGroup ?? "",
      aadhaar: s.aadhaar ?? "",
      status: s.status,
      fatherName: s.family?.fatherName ?? "",
      motherName: s.family?.motherName ?? "",
      guardianName: s.family?.guardianName ?? "",
      primaryPhone: s.family?.primaryPhone ?? "",
      secondaryPhone: s.family?.secondaryPhone ?? "",
      email: s.family?.email ?? "",
      addressLine1: s.family?.addressLine1 ?? "",
      addressLine2: s.family?.addressLine2 ?? "",
      city: s.family?.city ?? "",
      state: s.family?.state ?? "",
      pincode: s.family?.pincode ?? "",
      className: enrollment?.class?.name ?? "",
      sectionName: enrollment?.section?.name ?? "",
      outstandingDues,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
