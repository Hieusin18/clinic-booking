-- CreateEnum
CREATE TYPE "CallRule" AS ENUM ('FAIRNESS', 'APPOINTMENT', 'ARRIVAL', 'MANUAL');

-- DropIndex
DROP INDEX "Visit_doctorId_date_queueNumber_key";

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "appointmentAt" TIMESTAMP(3),
ADD COLUMN     "callRule" "CallRule",
ADD COLUMN     "calledAt" TIMESTAMP(3),
ADD COLUMN     "checkinOverride" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Visit_doctorId_date_source_queueNumber_key" ON "Visit"("doctorId", "date", "source", "queueNumber");

-- Lượt đặt online đã có: lấy giờ hẹn từ khung giờ đã đặt
UPDATE "Visit" AS v
SET "appointmentAt" = s."startTime"
FROM "Appointment" AS a
JOIN "Schedule" AS s ON s."id" = a."scheduleId"
WHERE a."id" = v."appointmentId";
