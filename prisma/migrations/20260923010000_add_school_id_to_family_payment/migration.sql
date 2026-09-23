-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE  new_FamilyPayment (
    id TEXT NOT NULL PRIMARY KEY,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL,
    schoolId TEXT NOT NULL,
    familyId TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    method TEXT NOT NULL,
    referenceNo TEXT,
    paidAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    receiptNo TEXT NOT NULL,
    receiptNumber INTEGER,
    notes TEXT,
    recordedById TEXT,
    CONSTRAINT FamilyPayment_recordedById_fkey FOREIGN KEY (recordedById) REFERENCES User (id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FamilyPayment_familyId_fkey FOREIGN KEY (familyId) REFERENCES Family (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT FamilyPayment_schoolId_fkey FOREIGN KEY (schoolId) REFERENCES School (id) ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO new_FamilyPayment (
    id, createdAt, updatedAt, schoolId, familyId, 
    amount, method, referenceNo, paidAt, receiptNo, 
    receiptNumber, notes, recordedById
)
SELECT 
    p.id,
    p.createdAt,
    p.updatedAt,
    COALESCE(
        (SELECT f.schoolId FROM Family f WHERE f.id = p.familyId),
        (SELECT s.id FROM School s LIMIT 1),
        'default-school'
    ) AS schoolId,
    p.familyId,
    p.amount,
    p.method,
    p.referenceNo,
    p.paidAt,
    p.receiptNo,
    NULL,
    p.notes,
    p.recordedById
FROM FamilyPayment p;

DROP TABLE FamilyPayment;
ALTER TABLE new_FamilyPayment RENAME TO FamilyPayment;

CREATE UNIQUE INDEX FamilyPayment_receiptNo_key ON FamilyPayment(receiptNo);
CREATE INDEX FamilyPayment_familyId_paidAt_idx ON FamilyPayment(familyId, paidAt);
CREATE UNIQUE INDEX FamilyPayment_schoolId_receiptNumber_key ON FamilyPayment(schoolId, receiptNumber);

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
