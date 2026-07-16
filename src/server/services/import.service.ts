import ExcelJS from "exceljs";
import { ImportType, Role } from "@prisma/client";
import { prisma } from "@/server/lib/prisma";
import { requirePermission } from "@/server/permissions/guard";
import { schoolIdFromUser } from "@/server/lib/helpers";
import { writeAuditLog } from "@/server/services/audit.service";
import { createFamily } from "@/server/services/family.service";
import { createStudent } from "@/server/services/student.service";
import { createStaff } from "@/server/services/staff.service";
import { createClass, createSection, createSubject } from "@/server/services/class.service";

type RowError = { row: number; message: string };
type PreviewRow = Record<string, string>;

const TEMPLATES: Record<ImportType, string[]> = {
  FAMILIES: ["familyCode", "fatherName", "motherName", "guardianName", "primaryPhone", "addressLine1"],
  STUDENTS: ["admissionNo", "firstName", "lastName", "dateOfBirth", "gender", "familyCode"],
  TEACHERS: ["employeeCode", "fullName", "phone", "designation"],
  CLASSES: ["name", "sortOrder"],
  SECTIONS: ["className", "sectionName"],
  SUBJECTS: ["name", "code"],
};

function cell(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  if (value instanceof Date) {
    const d = value.getUTCDate().toString().padStart(2, "0");
    const m = (value.getUTCMonth() + 1).toString().padStart(2, "0");
    const y = value.getUTCFullYear();
    return `${y}-${m}-${d}`;
  }
  return String(value).trim();
}

async function workbookFromBuffer(data: Buffer | Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings expect Buffer; Uint8Array works at runtime
  await workbook.xlsx.load(Buffer.from(data) as unknown as ExcelJS.Buffer);
  return workbook;
}

function sheetToRows(workbook: ExcelJS.Workbook, type: ImportType) {
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel file has no sheet");

  const headers = TEMPLATES[type];
  const rows: PreviewRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: PreviewRow = {};
    headers.forEach((h, idx) => {
      obj[h] = cell(row.getCell(idx + 1).value);
    });
    if (Object.values(obj).some((v) => v)) rows.push(obj);
  });
  return rows;
}

export async function downloadImportTemplate(type: ImportType) {
  await requirePermission("import.view");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(type);
  sheet.addRow(TEMPLATES[type]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function previewImport(type: ImportType, data: Buffer | Uint8Array) {
  const { user } = await requirePermission("import.create");
  const schoolId = schoolIdFromUser(user);
  const workbook = await workbookFromBuffer(data);
  const rows = sheetToRows(workbook, type);

  const errors: RowError[] = [];
  const valid: PreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const message = await validateRow(type, row, schoolId);
    if (message) errors.push({ row: rowNum, message });
    else valid.push(row);
  }

  const job = await prisma.importJob.create({
    data: {
      schoolId,
      type,
      status: "PREVIEW",
      successCount: valid.length,
      failCount: errors.length,
      errorReport: errors,
      preview: { valid, errors },
      uploadedById: user.id,
    },
  });

  return {
    jobId: job.id,
    total: rows.length,
    validCount: valid.length,
    failCount: errors.length,
    errors,
    preview: valid.slice(0, 20),
  };
}

async function validateRow(type: ImportType, row: PreviewRow, schoolId: string) {
  switch (type) {
    case "FAMILIES": {
      if (!row.fatherName && !row.motherName && !row.guardianName) {
        return "At least one of father/mother/guardian is required";
      }
      if (row.familyCode) {
        const dup = await prisma.family.findUnique({
          where: { schoolId_familyCode: { schoolId, familyCode: row.familyCode } },
        });
        if (dup) return `Duplicate family code ${row.familyCode}`;
      }
      return null;
    }
    case "STUDENTS": {
      if (!row.admissionNo || !row.firstName || !row.dateOfBirth || !row.familyCode) {
        return "admissionNo, firstName, dateOfBirth, familyCode are required";
      }
      if (Number.isNaN(Date.parse(row.dateOfBirth))) return "Invalid dateOfBirth";
      const family = await prisma.family.findUnique({
        where: { schoolId_familyCode: { schoolId, familyCode: row.familyCode } },
      });
      if (!family) return `Family code ${row.familyCode} not found (import families first)`;
      const dup = await prisma.student.findUnique({
        where: { schoolId_admissionNo: { schoolId, admissionNo: row.admissionNo } },
      });
      if (dup) return `Duplicate admission no ${row.admissionNo}`;
      return null;
    }
    case "TEACHERS": {
      if (!row.employeeCode || !row.fullName) return "employeeCode and fullName are required";
      const dup = await prisma.staffProfile.findUnique({
        where: { schoolId_employeeCode: { schoolId, employeeCode: row.employeeCode } },
      });
      if (dup) return `Duplicate employee code ${row.employeeCode}`;
      return null;
    }
    case "CLASSES": {
      if (!row.name) return "name is required";
      const dup = await prisma.class.findUnique({
        where: { schoolId_name: { schoolId, name: row.name } },
      });
      if (dup) return `Duplicate class ${row.name}`;
      return null;
    }
    case "SECTIONS": {
      if (!row.className || !row.sectionName) return "className and sectionName are required";
      const cls = await prisma.class.findUnique({
        where: { schoolId_name: { schoolId, name: row.className } },
      });
      if (!cls) return `Class ${row.className} not found`;
      const dup = await prisma.section.findUnique({
        where: { classId_name: { classId: cls.id, name: row.sectionName } },
      });
      if (dup) return `Section ${row.sectionName} already exists in ${row.className}`;
      return null;
    }
    case "SUBJECTS": {
      if (!row.name || !row.code) return "name and code are required";
      const byCode = await prisma.subject.findUnique({
        where: { schoolId_code: { schoolId, code: row.code } },
      });
      if (byCode) return `Duplicate subject code ${row.code}`;
      return null;
    }
    default:
      return "Unsupported import type";
  }
}

export async function executeImport(jobId: string) {
  const { user } = await requirePermission("import.create");
  const schoolId = schoolIdFromUser(user);

  const job = await prisma.importJob.findFirst({
    where: { id: jobId, schoolId },
  });
  if (!job) throw new Error("Import job not found");
  if (job.status !== "PREVIEW") throw new Error("Import job is not in preview state");

  const preview = job.preview as { valid?: PreviewRow[]; errors?: RowError[] } | null;
  const rows = preview?.valid ?? [];
  const runtimeErrors: RowError[] = [...(preview?.errors ?? [])];
  let success = 0;

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "IMPORTING" },
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      await importOne(job.type, row, schoolId);
      success += 1;
    } catch (e) {
      runtimeErrors.push({
        row: i + 2,
        message: e instanceof Error ? e.message : "Import failed",
      });
    }
  }

  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      successCount: success,
      failCount: runtimeErrors.length,
      errorReport: runtimeErrors,
    },
  });

  await writeAuditLog({
    schoolId,
    userId: user.id,
    action: "import",
    module: "import",
    entityType: "ImportJob",
    entityId: jobId,
    newValue: { type: job.type, success, fail: runtimeErrors.length },
  });

  return updated;
}

async function importOne(type: ImportType, row: PreviewRow, schoolId: string) {
  switch (type) {
    case "FAMILIES":
      await createFamily({
        familyCode: row.familyCode || null,
        fatherName: row.fatherName || null,
        motherName: row.motherName || null,
        guardianName: row.guardianName || null,
        primaryPhone: row.primaryPhone || null,
        addressLine1: row.addressLine1 || null,
      });
      return;
    case "STUDENTS": {
      const family = await prisma.family.findUniqueOrThrow({
        where: { schoolId_familyCode: { schoolId, familyCode: row.familyCode } },
      });
      await createStudent({
        familyId: family.id,
        admissionNo: row.admissionNo,
        firstName: row.firstName,
        lastName: row.lastName || null,
        dateOfBirth: new Date(row.dateOfBirth),
        gender:
          row.gender === "MALE" || row.gender === "FEMALE" || row.gender === "OTHER"
            ? row.gender
            : null,
        createLogin: true,
        status: "ACTIVE",
      });
      return;
    }
    case "TEACHERS":
      await createStaff({
        employeeCode: row.employeeCode,
        fullName: row.fullName,
        phone: row.phone || null,
        designation: row.designation || null,
        role: Role.TEACHER,
        createLogin: true,
      });
      return;
    case "CLASSES":
      await createClass({
        name: row.name,
        sortOrder: row.sortOrder ? Number(row.sortOrder) : 0,
      });
      return;
    case "SECTIONS": {
      const cls = await prisma.class.findUniqueOrThrow({
        where: { schoolId_name: { schoolId, name: row.className } },
      });
      await createSection({ classId: cls.id, name: row.sectionName });
      return;
    }
    case "SUBJECTS":
      await createSubject({ name: row.name, code: row.code });
      return;
    default:
      throw new Error("Unsupported import type");
  }
}
