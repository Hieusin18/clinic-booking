-- CreateEnum
CREATE TYPE "PhoneVerifyPurpose" AS ENUM ('REGISTER', 'RESET_PASSWORD');

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "PhoneVerifyPurpose" NOT NULL,
    "code" TEXT NOT NULL,
    "ticketHash" TEXT NOT NULL,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundSms" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fromRaw" TEXT NOT NULL,
    "phone" TEXT,
    "body" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "verificationId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundSms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneVerification_phone_createdAt_idx" ON "PhoneVerification"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneVerification_code_idx" ON "PhoneVerification"("code");

-- CreateIndex
CREATE INDEX "InboundSms_receivedAt_idx" ON "InboundSms"("receivedAt");
