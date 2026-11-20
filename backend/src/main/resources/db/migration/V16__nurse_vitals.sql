-- Điều dưỡng đo sinh hiệu khi bệnh nhân đang chờ, bác sĩ mở phiếu khám đã có sẵn số liệu
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'NURSE';

CREATE TABLE "VisitVitals" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "pulse" INTEGER,
    "temperature" DOUBLE PRECISION,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "respiratoryRate" INTEGER,
    "spo2" INTEGER,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "note" TEXT,
    "measuredById" TEXT,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitVitals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitVitals_visitId_key" ON "VisitVitals"("visitId");
ALTER TABLE "VisitVitals" ADD CONSTRAINT "VisitVitals_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitVitals" ADD CONSTRAINT "VisitVitals_measuredById_fkey" FOREIGN KEY ("measuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
