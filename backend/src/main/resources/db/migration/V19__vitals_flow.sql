-- Quy trình đo sinh hiệu: điều dưỡng gọi bệnh nhân vào đo, đo xong bác sĩ mới gọi vào khám
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VITALS_CALLED';

ALTER TABLE "Visit" ADD COLUMN "vitalsCalledAt" TIMESTAMP(3);
ALTER TABLE "Visit" ADD COLUMN "vitalsMeasuredAt" TIMESTAMP(3);
UPDATE "Visit" v SET "vitalsMeasuredAt" = s."measuredAt" FROM "VisitVitals" s WHERE s."visitId" = v."id";

-- Cài đặt của phòng khám do admin bật/tắt trên web (vd. bắt buộc đo sinh hiệu trước khi khám)
CREATE TABLE "ClinicSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicSetting_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "ClinicSetting" ADD CONSTRAINT "ClinicSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
