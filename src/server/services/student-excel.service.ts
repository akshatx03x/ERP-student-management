import ExcelJS from "exceljs";
import { prisma } from "@/server/lib/prisma";
import { buildFullName } from "@/server/lib/helpers";
import { writeAuditLog } from "@/server/services/audit.service";
import { attachFeeStructureInTx } from "@/server/services/fee.service";
import { createStudentUser } from "@/server/services/student.service";
import { EnrollmentStatus } from "@prisma/client";

type RowError = { row: number; message: string };

interface ParsedRow {
  rowNumber: number;
  admissionNo: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  aadhaar: string;
  status: string;
  fatherName: string;
  motherName: string;
  guardianName: string;
  primaryPhone: string;
  secondaryPhone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  className: string;
  sectionName: string;
}

function getFamilyKey(row: ParsedRow) {
  const f = (row.fatherName || "").trim().toLowerCase();
  const m = (row.motherName || "").trim().toLowerCase();
  const p = (row.primaryPhone || "").trim().toLowerCase();
  if (p) return `phone:${p}`;
  return `names:${f}|${m}`;
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
            { fullName: { contains: filters.search, mode: "insensitive" as const } },
            { admissionNo: { contains: filters.search, mode: "insensitive" as const } },
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

export async function importStudents(
  base64: string,
  schoolId: string,
  userId: string
) {
  const data = Buffer.from(base64, "base64");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel file has no worksheet");

  // Read headers
  const headerRow = sheet.getRow(1);
  const headerMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || "").trim().toLowerCase();
    headerMap[val] = colNumber;
  });

  // Helper to get cell value by header name
  const getValue = (row: ExcelJS.Row, headerName: string): string => {
    const colNumber = headerMap[headerName.toLowerCase()];
    if (!colNumber) return "";
    const cellValue = row.getCell(colNumber).value;
    if (cellValue == null) return "";
    if (typeof cellValue === "object" && "text" in cellValue) return String(cellValue.text || "").trim();
    if (cellValue instanceof Date) {
      return cellValue.toISOString().split("T")[0]!;
    }
    return String(cellValue).trim();
  };

  const rows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    const obj = {
      rowNumber,
      admissionNo: getValue(row, "Admission No") || getValue(row, "admissionNo"),
      firstName: getValue(row, "First Name") || getValue(row, "firstName"),
      middleName: getValue(row, "Middle Name") || getValue(row, "middleName"),
      lastName: getValue(row, "Last Name") || getValue(row, "lastName"),
      gender: getValue(row, "Gender") || getValue(row, "gender"),
      dateOfBirth: getValue(row, "Date of Birth") || getValue(row, "dateOfBirth"),
      bloodGroup: getValue(row, "Blood Group") || getValue(row, "bloodGroup"),
      aadhaar: getValue(row, "Aadhaar") || getValue(row, "aadhaar"),
      status: getValue(row, "Status") || getValue(row, "status") || "ACTIVE",
      fatherName: getValue(row, "Father Name") || getValue(row, "fatherName"),
      motherName: getValue(row, "Mother Name") || getValue(row, "motherName"),
      guardianName: getValue(row, "Guardian Name") || getValue(row, "guardianName"),
      primaryPhone: getValue(row, "Primary Phone") || getValue(row, "primaryPhone") || getValue(row, "phone"),
      secondaryPhone: getValue(row, "Secondary Phone") || getValue(row, "secondaryPhone"),
      email: getValue(row, "Email") || getValue(row, "email"),
      addressLine1: getValue(row, "Address Line 1") || getValue(row, "addressLine1") || getValue(row, "address"),
      addressLine2: getValue(row, "Address Line 2") || getValue(row, "addressLine2"),
      city: getValue(row, "City") || getValue(row, "city"),
      state: getValue(row, "State") || getValue(row, "state"),
      pincode: getValue(row, "Pincode") || getValue(row, "pincode"),
      className: getValue(row, "Class") || getValue(row, "className"),
      sectionName: getValue(row, "Section") || getValue(row, "sectionName"),
    };
    
    // Check if row has any data before processing
    if (Object.values(obj).some((v) => v !== rowNumber && v)) {
      rows.push(obj);
    }
  });

  const errors: RowError[] = [];
  const createdFamiliesMap = new Map<string, string>();
  let successCount = 0;

  // Fetch current session
  const currentSession = await prisma.academicSession.findFirst({
    where: { schoolId, isCurrent: true },
  });

  for (const row of rows) {
    const errorMsg = await validateRow(row, schoolId);
    if (errorMsg) {
      errors.push({ row: row.rowNumber, message: errorMsg });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Resolve Family
        const familyKey = getFamilyKey(row);
        let familyId = createdFamiliesMap.get(familyKey);

        if (!familyId) {
          // Check DB
          let dbFamily = null;
          if (row.primaryPhone) {
            dbFamily = await tx.family.findFirst({
              where: { primaryPhone: row.primaryPhone, schoolId },
            });
          }
          if (!dbFamily && row.fatherName && row.motherName) {
            dbFamily = await tx.family.findFirst({
              where: { fatherName: row.fatherName, motherName: row.motherName, schoolId },
            });
          }

          if (dbFamily) {
            familyId = dbFamily.id;
          } else {
            // Create family
            const newFamily = await tx.family.create({
              data: {
                schoolId,
                fatherName: row.fatherName || null,
                motherName: row.motherName || null,
                guardianName: row.guardianName || null,
                primaryPhone: row.primaryPhone || null,
                secondaryPhone: row.secondaryPhone || null,
                email: row.email || null,
                addressLine1: row.addressLine1 || null,
                addressLine2: row.addressLine2 || null,
                city: row.city || null,
                state: row.state || null,
                pincode: row.pincode || null,
              },
            });
            familyId = newFamily.id;
            await writeAuditLog(
              {
                schoolId,
                userId,
                action: "create",
                module: "family",
                entityType: "Family",
                entityId: newFamily.id,
                newValue: newFamily,
              },
              tx,
            );
          }
          createdFamiliesMap.set(familyKey, familyId);
        }

        // Create Student
        const genderVal =
          row.gender === "MALE" || row.gender === "FEMALE" || row.gender === "OTHER"
            ? row.gender
            : null;
        
        const fullName = buildFullName(row.firstName, row.middleName, row.lastName);

        const newStudent = await tx.student.create({
          data: {
            schoolId,
            familyId,
            admissionNo: row.admissionNo,
            firstName: row.firstName,
            middleName: row.middleName || null,
            lastName: row.lastName || null,
            fullName,
            dateOfBirth: new Date(row.dateOfBirth),
            gender: genderVal,
            bloodGroup: row.bloodGroup || null,
            aadhaar: row.aadhaar || null,
            status: row.status === "ACTIVE" || row.status === "INACTIVE" || row.status === "ALUMNI" || row.status === "TRANSFERRED" ? row.status : "ACTIVE",
          },
        });

        await writeAuditLog(
          {
            schoolId,
            userId,
            action: "create",
            module: "student",
            entityType: "Student",
            entityId: newStudent.id,
            newValue: newStudent,
          },
          tx,
        );

        // Create User Account Login
        await createStudentUser(tx, newStudent, schoolId);

        // Register Enrollment and Fees
        if (row.className && currentSession) {
          const cls = await tx.class.findFirstOrThrow({
            where: { name: row.className, schoolId },
          });
          const section = await tx.section.findFirstOrThrow({
            where: { name: row.sectionName, classId: cls.id },
          });

          await tx.studentEnrollment.create({
            data: {
              studentId: newStudent.id,
              sessionId: currentSession.id,
              classId: cls.id,
              sectionId: section.id,
              status: EnrollmentStatus.ACTIVE,
            },
          });

          await attachFeeStructureInTx(tx, {
            schoolId,
            studentId: newStudent.id,
            sessionId: currentSession.id,
            classId: cls.id,
            userId,
            requireStructure: false, // Don't crash if no structure is defined yet
          });
        }
      });
      successCount++;
    } catch (e) {
      errors.push({
        row: row.rowNumber,
        message: e instanceof Error ? e.message : "Internal Database error during row insert",
      });
    }
  }

  return { successCount, failCount: errors.length, errors };
}

async function validateRow(row: ParsedRow, schoolId: string) {
  if (!row.admissionNo || !row.admissionNo.trim()) {
    return "Admission No is required";
  }
  if (!row.firstName || !row.firstName.trim()) {
    return "First Name is required";
  }
  if (!row.dateOfBirth) {
    return "Date of Birth is required";
  }
  
  const parsedDate = Date.parse(row.dateOfBirth);
  if (Number.isNaN(parsedDate)) {
    return `Invalid Date of Birth: "${row.dateOfBirth}". Use YYYY-MM-DD format.`;
  }

  if (!row.fatherName && !row.motherName && !row.guardianName) {
    return "At least one parent/guardian name is required (Father, Mother, or Guardian)";
  }

  const dup = await prisma.student.findUnique({
    where: { schoolId_admissionNo: { schoolId, admissionNo: row.admissionNo } },
  });
  if (dup) {
    return `Student with Admission No "${row.admissionNo}" already exists`;
  }

  if (row.className) {
    const cls = await prisma.class.findFirst({
      where: { name: row.className, schoolId },
    });
    if (!cls) {
      return `Class "${row.className}" not found.`;
    }

    if (row.sectionName) {
      const section = await prisma.section.findFirst({
        where: { name: row.sectionName, classId: cls.id },
      });
      if (!section) {
        return `Section "${row.sectionName}" not found in class "${row.className}".`;
      }
    } else {
      return "Section is required if Class is specified";
    }
  }

  return null;
}
