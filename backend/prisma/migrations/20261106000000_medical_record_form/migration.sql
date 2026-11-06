-- AlterTable
ALTER TABLE "MedicalRecord" ADD COLUMN     "bpDiastolic" INTEGER,
ADD COLUMN     "bpSystolic" INTEGER,
ADD COLUMN     "familyHistory" TEXT,
ADD COLUMN     "followUpDate" DATE,
ADD COLUMN     "generalExam" TEXT,
ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "icdCode" TEXT,
ADD COLUMN     "labSummary" TEXT,
ADD COLUMN     "organExam" TEXT,
ADD COLUMN     "personalHistory" TEXT,
ADD COLUMN     "pulse" INTEGER,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "respiratoryRate" INTEGER,
ADD COLUMN     "secondaryDiagnosis" TEXT,
ADD COLUMN     "secondaryIcdCodes" TEXT,
ADD COLUMN     "spo2" INTEGER,
ADD COLUMN     "temperature" DOUBLE PRECISION,
ADD COLUMN     "treatment" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "ethnicity" TEXT,
ADD COLUMN     "insuranceExpiry" DATE,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "relativeName" TEXT,
ADD COLUMN     "relativePhone" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_code_key" ON "Prescription"("code");
