-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "historyLockedBefore" TIMESTAMP(3),
ADD COLUMN     "linkCode" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifyFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verifyLockedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_linkCode_key" ON "Patient"("linkCode");
