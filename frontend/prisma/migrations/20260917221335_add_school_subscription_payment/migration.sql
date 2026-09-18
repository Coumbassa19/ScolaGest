-- CreateTable
CREATE TABLE "SchoolSubscriptionPayment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerChargeId" TEXT,
    "paymentUrl" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSubscriptionPayment_idempotencyKey_key" ON "SchoolSubscriptionPayment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSubscriptionPayment_providerChargeId_key" ON "SchoolSubscriptionPayment"("providerChargeId");

-- CreateIndex
CREATE INDEX "SchoolSubscriptionPayment_schoolId_idx" ON "SchoolSubscriptionPayment"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolSubscriptionPayment_status_idx" ON "SchoolSubscriptionPayment"("status");

-- AddForeignKey
ALTER TABLE "SchoolSubscriptionPayment" ADD CONSTRAINT "SchoolSubscriptionPayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

