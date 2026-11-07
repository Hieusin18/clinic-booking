-- CreateEnum
CREATE TYPE "DoctorHistoryKind" AS ENUM ('EDUCATION', 'WORK');

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "expertise" TEXT,
ADD COLUMN     "practiceSince" INTEGER;

-- CreateTable
CREATE TABLE "DoctorHistory" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "kind" "DoctorHistoryKind" NOT NULL,
    "fromYear" INTEGER NOT NULL,
    "toYear" INTEGER,
    "title" TEXT NOT NULL,
    "place" TEXT NOT NULL,

    CONSTRAINT "DoctorHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorAvatar" (
    "doctorId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorAvatar_pkey" PRIMARY KEY ("doctorId")
);

-- CreateIndex
CREATE INDEX "DoctorHistory_doctorId_idx" ON "DoctorHistory"("doctorId");

-- AddForeignKey
ALTER TABLE "DoctorHistory" ADD CONSTRAINT "DoctorHistory_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAvatar" ADD CONSTRAINT "DoctorAvatar_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
