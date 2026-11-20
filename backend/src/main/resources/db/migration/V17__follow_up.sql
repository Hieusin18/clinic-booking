-- Hẹn tái khám: bác sĩ đặt sẵn lịch tái khám cho bệnh nhân, hoặc hệ thống nhắc bệnh nhân tự đặt khi gần đến hạn
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';

-- Lịch hẹn do bác sĩ đặt để tái khám cho lượt khám này
ALTER TABLE "Appointment" ADD COLUMN "followUpOfVisitId" TEXT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_followUpOfVisitId_fkey" FOREIGN KEY ("followUpOfVisitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Appointment_followUpOfVisitId_idx" ON "Appointment"("followUpOfVisitId");

-- Đã nhắc bệnh nhân đặt lịch tái khám (mỗi bệnh án nhắc một lần)
ALTER TABLE "MedicalRecord" ADD COLUMN "followUpRemindedAt" TIMESTAMP(3);
CREATE INDEX "MedicalRecord_followUpDate_idx" ON "MedicalRecord"("followUpDate");
