-- CreateEnum
CREATE TYPE "ResultMode" AS ENUM ('RETURN', 'ONLINE');

-- AlterEnum
ALTER TYPE "VisitStatus" ADD VALUE 'AWAITING_RESULTS' BEFORE 'DONE';

-- AlterEnum
ALTER TYPE "CallRule" ADD VALUE 'RESULTS';

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "resultMode" "ResultMode",
ADD COLUMN     "resultsReadyAt" TIMESTAMP(3),
ADD COLUMN     "sentForTestsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "resultText" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabFile" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabOrder_visitId_idx" ON "LabOrder"("visitId");

-- CreateIndex
CREATE INDEX "LabFile_labOrderId_idx" ON "LabFile"("labOrderId");

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabFile" ADD CONSTRAINT "LabFile_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
