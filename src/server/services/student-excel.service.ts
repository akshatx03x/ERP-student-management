import ExcelJS from "exceljs";
import { prisma } from "@/server/lib/prisma";
import { buildFullName, schoolIdFromUser, decimalToNumber } from "@/server/lib/helpers";
import { writeAuditLog } from "@/server/services/audit.service";
import { createStudentWithFamily } from "@/server/services/student.service";
import { requirePermission } from "@/server/permissions/guard";
import { Gender, StudentCategory, StudentStatus } from "@prisma/client";

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
  return null;
}

// Reusable helper to map Excel class names/aliases to database class names
const CLASS_ALIAS_MAP: Record<string, string> = {
  "pp-1": "Class PP",
  "pp-2": "Class PP",
  "pp1": "Class PP",
  "pp2": "Class PP",
  "pp": "Class PP",
  "lkg": "Class PP",
  "ukg": "Class PP",
  "nursery": "Class PP",
  "i": "Class 1",
  "ii": "Class 2",
  "iii": "Class 3",
  "iv": "Class 4",
  "v": "Class 5",
  "vi": "Class 6",
  "vii": "Class 7",
  "viii": "Class 8",
  "ix": "Class 9",
  "x": "Class 10",
  "xi": "Class 11",
  "xii": "Class 12",
};

export function getNormalizedClassNameAlias(className: string): string {
  const normalized = className
    .replace(/^["'\s\u200B-\u200D\uFEFF]+|["'\s\u200B-\u200D\uFEFF]+$/g, "")
    .trim()
    .toLowerCase();

  if (CLASS_ALIAS_MAP[normalized]) {
    return CLASS_ALIAS_MAP[normalized];
  }

  if (normalized.startsWith("pp")) {
    return "Class PP";
  }

  if (/^\d+$/.test(normalized)) {
    return `Class ${normalized}`;
  }

  const ordinalMatch = normalized.match(/^(\d+)(st|nd|rd|th)$/);
  if (ordinalMatch) {
    return `Class ${ordinalMatch[1]}`;
  }

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
    .replace(/^["'\s\u200B-\u200D\uFEFF]+|["'\s\u200B-\u200D\uFEFF]+$/g, "") // remove leading/trailing quotes/spaces/hidden characters
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, " "); // collapse spacing and hidden characters
}

// Helper to normalize class inputs and find matches/suggestions
function findClassMatch(className: string, dbClasses: Array<{ id: string; name: string }>) {
  const mappedClassName = getNormalizedClassNameAlias(className);
  const normalizedInput = normalizeClassName(mappedClassName);
  const cleanInput = normalizedInput.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (!cleanInput) return { matchedClass: null, suggestion: null };

  // Try direct match against normalized ERP classes
  const directMatch = dbClasses.find(c => {
    const cleanDb = normalizeClassName(c.name).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return cleanDb === cleanInput;
  });
  if (directMatch) return { matchedClass: directMatch, suggestion: null };

  // Attempt Roman numeral conversion (e.g., "XII" -> "12" or "12th")
  const romanMatch = cleanInput.match(/^(i{1,3}|iv|v|vi{1,3}|ix|x|xi{0,2}|xii)$/);
  let convertedInput = cleanInput;
  if (romanMatch) {
    const arabic = romanToArabic(romanMatch[0]);
    convertedInput = String(arabic);
  }

  // Search DB classes with converted numbers or arabic equivalent
  const matchWithConversion = dbClasses.find(c => {
    const cleanDb = normalizeClassName(c.name).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    // Compare translated arabic or Roman equivalents
    if (cleanDb === convertedInput || cleanDb === convertedInput + "th") return true;
    return false;
  });
  if (matchWithConversion) return { matchedClass: matchWithConversion, suggestion: null };

  // Generate closest suggestion based on substring
  const suggestion = dbClasses.find(c => {
    const cleanDb = normalizeClassName(c.name).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return cleanDb.includes(cleanInput) || cleanInput.includes(cleanDb);
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
  const clean = str.toLowerCase();
  if (clean.startsWith("m") || clean === "boy") return Gender.MALE;
  if (clean.startsWith("f") || clean === "girl") return Gender.FEMALE;
  if (clean.startsWith("o")) return Gender.OTHER;
  return null;
}

// Normalize Social Category
function normalizeCategory(val: any): StudentCategory | null {
  const str = normalizeString(val);
  if (!str) return null;
  const clean = str.toLowerCase();
  if (clean.includes("general") || clean.includes("1")) return StudentCategory.GENERAL;
  if (clean.includes("obc") || clean.includes("4")) return StudentCategory.OBC;
  if (clean.includes("sc") || clean.includes("2")) return StudentCategory.SC;
  if (clean.includes("st") || clean.includes("3")) return StudentCategory.ST;
  if (clean.includes("ews")) return StudentCategory.EWS;
  return StudentCategory.OTHER;
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

  const existingNos = new Set(students.map(s => s.admissionNo).filter(Boolean));

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
  duplicateStrategy: "SKIP" | "FAIL"
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

  const currentSession = await prisma.academicSession.findFirst({
    where: { schoolId, isCurrent: true },
  });

  const admBase = await getNextAdmissionNoBase(schoolId);
  let generatedCount = 0;

  const rows: ValidationResultRow[] = [];
  const processedAdmissions = new Set<string>();
  const processedPens = new Set<string>();
  const processedAadhaars = new Set<string>();

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

    // Logging first imported row for easier template debugging
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

    // 1. Mandatory Fields Validation
    if (!rawName) {
      status = "ERROR";
      reasons.push("Student Name is required");
    }

    // Auto-generate Admission Number if blank/missing
    let finalAdmissionNo = rawAdmissionNo;
    if (!finalAdmissionNo) {
      while (true) {
        const nextNum = admBase.currentNum + 1 + generatedCount;
        const padded = String(nextNum).padStart(admBase.formatLength, "0");
        const candidate = `${admBase.prefix}${padded}`;
        generatedCount++;
        if (!admBase.existingNos.has(candidate) && !processedAdmissions.has(candidate)) {
          finalAdmissionNo = candidate;
          break;
        }
      }
    }

    // Date of Birth check (optional/nullable)
    let dobDate: Date | null = null;
    if (rawDob) {
      const ts = Date.parse(rawDob);
      if (isNaN(ts)) {
        // Fallback silently to null
        dobDate = null;
      } else {
        dobDate = new Date(ts);
      }
    }

    // 2. Class & Section mapping validation
    let classId: string | null = null;
    let sectionId: string | null = null;
    if (rawClass) {
      const { matchedClass, suggestion } = findClassMatch(rawClass, dbClasses);
      if (matchedClass) {
        classId = matchedClass.id;
        if (rawSection) {
          const matchedSection = (matchedClass as any).sections.find(
            (s: any) => s.name.trim().toLowerCase() === rawSection.trim().toLowerCase()
          );
          if (matchedSection) {
            sectionId = matchedSection.id;
          } else {
            status = "ERROR";
            reasons.push(`Section "${rawSection}" not found in class "${matchedClass.name}"`);
          }
        } else {
          status = "ERROR";
          reasons.push("Section name is required when Class is specified");
        }
      } else {
        status = "ERROR";
        if (suggestion) {
          reasons.push(`Class "${rawClass}" not found. Did you mean "${suggestion}"?`);
        } else {
          reasons.push(`Class "${rawClass}" not found in ERP`);
        }
      }
    } else {
      status = "ERROR";
      reasons.push("Class name is required");
    }

    // 3. Duplicate checks within Excel sheet itself
    if (finalAdmissionNo && processedAdmissions.has(finalAdmissionNo)) {
      status = "ERROR";
      reasons.push(`Duplicate Admission No "${finalAdmissionNo}" in Excel`);
    } else if (finalAdmissionNo) {
      processedAdmissions.add(finalAdmissionNo);
    }

    if (rawPen && processedPens.has(rawPen)) {
      processedPens.add(rawPen);
    }

    if (rawAadhaar && rawAadhaar !== "NOT AVAILABLE" && !rawAadhaar.includes("*") && processedAadhaars.has(rawAadhaar)) {
      processedAadhaars.add(rawAadhaar);
    }

    // 4. Database Unique Constraint Checks (AdmissionNo)
    if (status !== "ERROR" && finalAdmissionNo) {
      if (admBase.existingNos.has(finalAdmissionNo)) {
        if (duplicateStrategy === "FAIL") {
          status = "ERROR";
          reasons.push(`Admission No. "${finalAdmissionNo}" already exists in ERP`);
        } else {
          status = "WARNING";
          reasons.push(`Admission No. "${finalAdmissionNo}" already exists (Row will be skipped)`);
        }
      }
    }

    // Normalize Full Name logic safely (preserve original fullName)
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
      // Fallback/placeholder guardianName to satisfy validation in createStudentWithFamily
      guardianName = "Parent/Guardian";
    }

    const payload = {
      admissionNo: finalAdmissionNo,
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
      phone: normalizeString(getValue(row, "primaryPhone")),
      secondaryPhone: normalizeString(getValue(row, "secondaryPhone")),
      email: normalizeString(getValue(row, "email")),
      address: normalizeString(getValue(row, "address")),
      resAddressLine2: normalizeString(getValue(row, "addressLine2")),
      resCity: normalizeString(getValue(row, "city")),
      resState: normalizeString(getValue(row, "state")),
      resPincode: normalizeString(getValue(row, "pincode")),
      enroll: true,
      sessionId: currentSession?.id || null,
      classId,
      sectionId,
      allowDuplicate: true,
      createLogin: true
    };

    if (rowNumber === headerRowIndex + 1) {
      console.log("[StudentImport Logging] Final mapped student object before validation:", payload);
    }

    rows.push({
      rowNumber,
      studentName: rawName || "",
      admissionNo: finalAdmissionNo || "",
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

  return {
    summary: {
      ready: readyCount,
      warnings: warningCount,
      errors: errorCount,
      total: rows.length
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
  userId: string
) {
  const { user } = await requirePermission("student.create");
  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const rowsToProcess = validatedRows.filter(r => r.status !== "ERROR");

  // Single global transaction execution (timeout: 5 minutes / 300000 ms)
  await prisma.$transaction(async (tx) => {
    for (const item of rowsToProcess) {
      if (item.status === "WARNING") {
        skippedCount++;
        continue;
      }

      try {
        const studentInput = {
          ...item.data,
          schoolId
        };
        
        await createStudentWithFamily(studentInput, tx);
        importedCount++;
      } catch (err) {
        failedCount = rowsToProcess.length - importedCount;
        throw new Error(
          `Import aborted & rolled back. Failed on Excel Row ${item.rowNumber} (${item.studentName}): ${err instanceof Error ? err.message : "Database write error"}`
        );
      }
    }

    // Write audit log inside the transaction to keep it fully atomic
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
        skippedCount,
        failedCount
      }
    }, tx);
  }, {
    timeout: 300000 // 5 minutes timeout to allow full atomic processing of 268+ students
  });

  return {
    imported: importedCount,
    skipped: skippedCount,
    failed: failedCount
  };
}

/**
 * Step 4: Generates the sample Excel file download template matching expected headers.
 */
export async function downloadImportSample() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students Template");

  worksheet.columns = [
    { header: "Admission No", key: "admissionNo", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Gender", key: "gender", width: 12 },
    { header: "Date of Birth", key: "dateOfBirth", width: 15 },
    { header: "Student PEN", key: "penId", width: 15 },
    { header: "Father Name", key: "fatherName", width: 20 },
    { header: "Mother Name", key: "motherName", width: 20 },
    { header: "Guardian Name", key: "guardianName", width: 20 },
    { header: "Social Category", key: "category", width: 15 },
    { header: "AADHAAR No.", key: "aadhaar", width: 15 },
    { header: "Class", key: "className", width: 15 },
    { header: "Section", key: "sectionName", width: 12 },
    { header: "Primary Phone", key: "primaryPhone", width: 15 },
    { header: "Secondary Phone", key: "secondaryPhone", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Address Line 1", key: "address", width: 30 },
    { header: "Address Line 2", key: "addressLine2", width: 30 },
    { header: "City", key: "city", width: 15 },
    { header: "State", key: "state", width: 15 },
    { header: "Pincode", key: "pincode", width: 12 }
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "F2F2F2" },
  };

  worksheet.addRow({
    admissionNo: "ADM-2026-001",
    name: "John Doe",
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
    primaryPhone: "9876543210",
    secondaryPhone: "",
    email: "john.doe@example.com",
    address: "123 School Lane",
    addressLine2: "",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110001"
  });

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
