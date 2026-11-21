-- Khách vãng lai giữ một khung giờ của bác sĩ (mỗi khung = một lượt khám, dùng chung với người đặt lịch)
ALTER TABLE "Visit" ADD COLUMN "scheduleId" TEXT;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Visit_scheduleId_idx" ON "Visit"("scheduleId");
