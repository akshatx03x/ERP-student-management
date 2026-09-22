-- CreateTable
CREATE TABLE IF NOT EXISTS "StudentOptionalFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "feeHeadId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "months" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    CONSTRAINT "StudentOptionalFee_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentOptionalFee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentOptionalFee_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentOptionalFee_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "optionalFeeId" TEXT,
    CONSTRAINT "StudentFee_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentFee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentFee_feeHeadId_fkey" FOREIGN KEY ("feeHeadId") REFERENCES "FeeHead" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StudentFee_optionalFeeId_fkey" FOREIGN KEY ("optionalFeeId") REFERENCES "StudentOptionalFee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StudentFee" ("amount", "createdAt", "discountAmount", "dueDate", "dueYear", "feeHeadId", "id", "month", "remarks", "sessionId", "status", "studentId", "updatedAt") SELECT "amount", "createdAt", "discountAmount", "dueDate", "dueYear", "feeHeadId", "id", "month", "remarks", "sessionId", "status", "studentId", "updatedAt" FROM "StudentFee";
DROP TABLE "StudentFee";
ALTER TABLE "new_StudentFee" RENAME TO "StudentFee";
CREATE INDEX "StudentFee_studentId_sessionId_status_idx" ON "StudentFee"("studentId", "sessionId", "status");
CREATE INDEX "StudentFee_sessionId_status_idx" ON "StudentFee"("sessionId", "status");
CREATE INDEX "StudentFee_studentId_month_idx" ON "StudentFee"("studentId", "month");
CREATE UNIQUE INDEX "StudentFee_studentId_sessionId_feeHeadId_month_key" ON "StudentFee"("studentId", "sessionId", "feeHeadId", "month");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentOptionalFee_studentId_sessionId_isActive_idx" ON "StudentOptionalFee"("studentId", "sessionId", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentOptionalFee_schoolId_idx" ON "StudentOptionalFee"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StudentOptionalFee_studentId_sessionId_feeHeadId_key" ON "StudentOptionalFee"("studentId", "sessionId", "feeHeadId");
