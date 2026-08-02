-- AlterTable
ALTER TABLE "Family" ADD COLUMN "fatherPhotoUrl" TEXT;
ALTER TABLE "Family" ADD COLUMN "motherPhotoUrl" TEXT;
ALTER TABLE "Family" ADD COLUMN "primaryPhoneBelongsTo" TEXT;
ALTER TABLE "Family" ADD COLUMN "secondaryPhoneBelongsTo" TEXT;

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Guardian" ADD COLUMN "whatsAppNumber" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "previousBoard" TEXT;
ALTER TABLE "Student" ADD COLUMN "previousReason" TEXT;
ALTER TABLE "Student" ADD COLUMN "transportDriver" TEXT;
ALTER TABLE "Student" ADD COLUMN "transportDriverContact" TEXT;
ALTER TABLE "Student" ADD COLUMN "transportRoute" TEXT;
ALTER TABLE "Student" ADD COLUMN "transportVehicle" TEXT;

-- AlterTable
ALTER TABLE "StudentMedical" ADD COLUMN "disability" TEXT;
ALTER TABLE "StudentMedical" ADD COLUMN "emergencyRemarks" TEXT;
