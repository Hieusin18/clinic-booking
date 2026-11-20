-- Lịch đặt online chờ lễ tân duyệt (chống đặt lịch hàng loạt): PENDING = chờ duyệt, CONFIRMED = đã duyệt,
-- REJECTED = lễ tân từ chối hoặc hết giờ khám mà chưa được duyệt
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_REJECTED';

ALTER TABLE "Appointment" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "rejectReason" TEXT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lịch online đã đặt trước bản này đều đã được xác nhận tự động
UPDATE "Appointment" SET "status" = 'CONFIRMED' WHERE "status" = 'PENDING';

CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");
