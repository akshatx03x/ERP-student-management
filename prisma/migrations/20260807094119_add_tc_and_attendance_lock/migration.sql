-- CreateTable
CREATE TABLE "AttendanceLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "TransferCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tcNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "dateOfIssue" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendance" TEXT,
    "conduct" TEXT DEFAULT 'Good',
    "remarks" TEXT,
    "previousStatus" TEXT DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "updatedById" TEXT,
    CONSTRAINT "TransferCertificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransferCertificate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransferCertificate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransferCertificate_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransferCertificate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransferCertificate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransferCertificate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceLock_sessionId_year_month_key" ON "AttendanceLock"("sessionId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TransferCertificate_tcNumber_key" ON "TransferCertificate"("tcNumber");
