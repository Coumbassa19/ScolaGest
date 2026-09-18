-- AlterTable
ALTER TABLE "RevenuePayment" ADD COLUMN     "numeroRecu" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RevenuePayment_numeroRecu_key" ON "RevenuePayment"("numeroRecu");
