-- AlterTable
ALTER TABLE "AdmissionApplication" ADD COLUMN "fatherEmail" TEXT;
ALTER TABLE "AdmissionApplication" ADD COLUMN "motherEmail" TEXT;
ALTER TABLE "AdmissionApplication" ADD COLUMN "srNo" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "srNo" TEXT;

-- CreateTable
CREATE TABLE "StudentExit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "studentId" TEXT NOT NULL,
    "leavingDate" DATETIME NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'TRANSFERRED',
    "tcNumber" TEXT,
    "tcDate" DATETIME,
    "remarks" TEXT,
    "createdById" TEXT,
    CONSTRAINT "StudentExit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentExit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromotionBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "fromSessionId" TEXT NOT NULL,
    "toSessionId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    CONSTRAINT "PromotionBatch_toSessionId_fkey" FOREIGN KEY ("toSessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PromotionBatch_fromSessionId_fkey" FOREIGN KEY ("fromSessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PromotionBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeeStructureItemMonth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "feeStructureItemId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    CONSTRAINT "FeeStructureItemMonth_feeStructureItemId_fkey" FOREIGN KEY ("feeStructureItemId") REFERENCES "FeeStructureItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyAdvanceWallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "familyId" TEXT NOT NULL,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "FamilyAdvanceWallet_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdvanceTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "walletId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "paymentId" TEXT,
    "targetStudentId" TEXT,
    "targetStudentFeeId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "balanceBefore" DECIMAL NOT NULL,
    "balanceAfter" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "recordedById" TEXT,
    CONSTRAINT "AdvanceTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AdvanceTransaction_targetStudentFeeId_fkey" FOREIGN KEY ("targetStudentFeeId") REFERENCES "StudentFee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AdvanceTransaction_targetStudentId_fkey" FOREIGN KEY ("targetStudentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AdvanceTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FamilyPayment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AdvanceTransaction_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdvanceTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "FamilyAdvanceWallet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeeDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "feeHeadId" TEXT,
    "month" TEXT,
    "discountType" TEXT NOT NULL,
    "value" DECIMAL NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "remarks" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTill" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "FeeDiscount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeeDiscount_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeeDiscount_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FeeDiscount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeeDiscount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeeLateRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTill" DATETIME,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "calculationType" TEXT NOT NULL,
    "fixedAmount" DECIMAL,
    "percentage" DECIMAL,
    "applyPerDay" DECIMAL,
    "applyPerMonth" DECIMAL,
    "maxFine" DECIMAL,
    "applicableFeeHeads" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    CONSTRAINT "FeeLateRule_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeeLateRule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FeeLateRule_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FeeLateRule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentFeeFine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "studentFeeId" TEXT NOT NULL,
    "lateRuleId" TEXT,
    "generatedOn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedAmount" DECIMAL NOT NULL,
    "waivedAmount" DECIMAL NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL NOT NULL,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "waivedById" TEXT,
    "waivedAt" DATETIME,
    "waiveReason" TEXT,
    CONSTRAINT "StudentFeeFine_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudentFeeFine_lateRuleId_fkey" FOREIGN KEY ("lateRuleId") REFERENCES "FeeLateRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudentFeeFine_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashBookEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryType" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL,
    "remarks" TEXT,
    "voucherNo" TEXT,
    "recordedById" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" DATETIME,
    "voidedById" TEXT,
    "voidReason" TEXT,
    CONSTRAINT "CashBookEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashBookEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CashBookEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentTermResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "workingDays" INTEGER,
    "presentDays" INTEGER,
    "remarksMid" TEXT,
    "remarksFinal" TEXT,
    "resultOutcome" TEXT,
    "principalRemarks" TEXT,
    CONSTRAINT "StudentTermResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentTermResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResultChangeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    CONSTRAINT "ResultChangeLog_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "StudentTermResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResultChangeLog_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassSubject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ClassSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassSubject_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassSubject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClassSubject" ("classId", "createdAt", "id", "sessionId", "subjectId", "updatedAt") SELECT "classId", "createdAt", "id", "sessionId", "subjectId", "updatedAt" FROM "ClassSubject";
DROP TABLE "ClassSubject";
ALTER TABLE "new_ClassSubject" RENAME TO "ClassSubject";
CREATE UNIQUE INDEX "ClassSubject_sessionId_classId_subjectId_key" ON "ClassSubject"("sessionId", "classId", "subjectId");
CREATE TABLE "new_Exam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sessionId" TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "term" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "maxMarks" DECIMAL,
    "passMarks" DECIMAL,
    "publishStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibilityStatus" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Exam_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Exam_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Exam_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Exam" ("classId", "createdAt", "endDate", "examTypeId", "id", "name", "sessionId", "startDate", "updatedAt") SELECT "classId", "createdAt", "endDate", "examTypeId", "id", "name", "sessionId", "startDate", "updatedAt" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";
CREATE INDEX "Exam_sessionId_classId_idx" ON "Exam"("sessionId", "classId");
CREATE TABLE "new_FeePaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "paymentId" TEXT,
    "studentId" TEXT NOT NULL,
    "studentFeeId" TEXT,
    "studentFeeFineId" TEXT,
    "amount" DECIMAL NOT NULL,
    CONSTRAINT "FeePaymentAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePaymentAllocation_studentFeeFineId_fkey" FOREIGN KEY ("studentFeeFineId") REFERENCES "StudentFeeFine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePaymentAllocation_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeePaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FamilyPayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FeePaymentAllocation" ("amount", "createdAt", "id", "paymentId", "studentFeeId", "studentId", "updatedAt") SELECT "amount", "createdAt", "id", "paymentId", "studentFeeId", "studentId", "updatedAt" FROM "FeePaymentAllocation";
DROP TABLE "FeePaymentAllocation";
ALTER TABLE "new_FeePaymentAllocation" RENAME TO "FeePaymentAllocation";
CREATE INDEX "FeePaymentAllocation_studentId_idx" ON "FeePaymentAllocation"("studentId");
CREATE INDEX "FeePaymentAllocation_paymentId_idx" ON "FeePaymentAllocation"("paymentId");
CREATE INDEX "FeePaymentAllocation_studentFeeFineId_idx" ON "FeePaymentAllocation"("studentFeeFineId");
CREATE TABLE "new_StudentEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "rollNo" TEXT,
    "house" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "promotionBatchId" TEXT,
    CONSTRAINT "StudentEnrollment_promotionBatchId_fkey" FOREIGN KEY ("promotionBatchId") REFERENCES "PromotionBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudentEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentEnrollment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentEnrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentEnrollment" ("classId", "createdAt", "id", "rollNo", "sectionId", "sessionId", "status", "studentId", "updatedAt") SELECT "classId", "createdAt", "id", "rollNo", "sectionId", "sessionId", "status", "studentId", "updatedAt" FROM "StudentEnrollment";
DROP TABLE "StudentEnrollment";
ALTER TABLE "new_StudentEnrollment" RENAME TO "StudentEnrollment";
CREATE INDEX "StudentEnrollment_sessionId_sectionId_idx" ON "StudentEnrollment"("sessionId", "sectionId");
CREATE INDEX "StudentEnrollment_sessionId_classId_idx" ON "StudentEnrollment"("sessionId", "classId");
CREATE UNIQUE INDEX "StudentEnrollment_studentId_sessionId_key" ON "StudentEnrollment"("studentId", "sessionId");
CREATE TABLE "new_StudentFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "month" TEXT,
    "dueYear" INTEGER,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    CONSTRAINT "StudentFee_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentFee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentFee_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentFee" ("amount", "createdAt", "dueDate", "feeHeadId", "id", "remarks", "sessionId", "status", "studentId", "updatedAt") SELECT "amount", "createdAt", "dueDate", "feeHeadId", "id", "remarks", "sessionId", "status", "studentId", "updatedAt" FROM "StudentFee";
DROP TABLE "StudentFee";
ALTER TABLE "new_StudentFee" RENAME TO "StudentFee";
CREATE INDEX "StudentFee_studentId_sessionId_status_idx" ON "StudentFee"("studentId", "sessionId", "status");
CREATE INDEX "StudentFee_sessionId_status_idx" ON "StudentFee"("sessionId", "status");
CREATE INDEX "StudentFee_studentId_month_idx" ON "StudentFee"("studentId", "month");
CREATE UNIQUE INDEX "StudentFee_studentId_sessionId_feeHeadId_month_key" ON "StudentFee"("studentId", "sessionId", "feeHeadId", "month");
CREATE TABLE "new_Subject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT 'SCHOLASTIC',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subject" ("code", "createdAt", "id", "name", "schoolId", "updatedAt") SELECT "code", "createdAt", "id", "name", "schoolId", "updatedAt" FROM "Subject";
DROP TABLE "Subject";
ALTER TABLE "new_Subject" RENAME TO "Subject";
CREATE UNIQUE INDEX "Subject_schoolId_code_key" ON "Subject"("schoolId", "code");
CREATE UNIQUE INDEX "Subject_schoolId_name_key" ON "Subject"("schoolId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "StudentExit_studentId_key" ON "StudentExit"("studentId");

-- CreateIndex
CREATE INDEX "StudentExit_leavingDate_idx" ON "StudentExit"("leavingDate");

-- CreateIndex
CREATE INDEX "PromotionBatch_fromSessionId_toSessionId_idx" ON "PromotionBatch"("fromSessionId", "toSessionId");

-- CreateIndex
CREATE INDEX "FeeStructureItemMonth_feeStructureItemId_idx" ON "FeeStructureItemMonth"("feeStructureItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructureItemMonth_feeStructureItemId_month_key" ON "FeeStructureItemMonth"("feeStructureItemId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyAdvanceWallet_familyId_key" ON "FamilyAdvanceWallet"("familyId");

-- CreateIndex
CREATE INDEX "FamilyAdvanceWallet_familyId_idx" ON "FamilyAdvanceWallet"("familyId");

-- CreateIndex
CREATE INDEX "AdvanceTransaction_walletId_createdAt_idx" ON "AdvanceTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "AdvanceTransaction_familyId_createdAt_idx" ON "AdvanceTransaction"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "AdvanceTransaction_paymentId_idx" ON "AdvanceTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "AdvanceTransaction_targetStudentFeeId_idx" ON "AdvanceTransaction"("targetStudentFeeId");

-- CreateIndex
CREATE INDEX "AdvanceTransaction_targetStudentId_idx" ON "AdvanceTransaction"("targetStudentId");

-- CreateIndex
CREATE INDEX "FeeDiscount_studentId_sessionId_status_idx" ON "FeeDiscount"("studentId", "sessionId", "status");

-- CreateIndex
CREATE INDEX "FeeDiscount_schoolId_idx" ON "FeeDiscount"("schoolId");

-- CreateIndex
CREATE INDEX "FeeLateRule_schoolId_sessionId_isActive_idx" ON "FeeLateRule"("schoolId", "sessionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFeeFine_studentFeeId_key" ON "StudentFeeFine"("studentFeeId");

-- CreateIndex
CREATE INDEX "StudentFeeFine_studentFeeId_idx" ON "StudentFeeFine"("studentFeeId");

-- CreateIndex
CREATE INDEX "StudentFeeFine_status_idx" ON "StudentFeeFine"("status");

-- CreateIndex
CREATE INDEX "CashBookEntry_schoolId_date_idx" ON "CashBookEntry"("schoolId", "date");

-- CreateIndex
CREATE INDEX "CashBookEntry_schoolId_entryType_idx" ON "CashBookEntry"("schoolId", "entryType");

-- CreateIndex
CREATE INDEX "CashBookEntry_schoolId_isVoided_idx" ON "CashBookEntry"("schoolId", "isVoided");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTermResult_studentId_sessionId_key" ON "StudentTermResult"("studentId", "sessionId");
