-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "poste" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "salaireMensuel" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPayment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moyenPaiement" TEXT NOT NULL DEFAULT 'ESPECES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Staff_schoolId_idx" ON "Staff"("schoolId");

-- CreateIndex
CREATE INDEX "StaffPayment_staffId_idx" ON "StaffPayment"("staffId");

-- CreateIndex
CREATE INDEX "StaffPayment_periode_idx" ON "StaffPayment"("periode");

-- CreateIndex
CREATE INDEX "StaffPayment_schoolId_idx" ON "StaffPayment"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPayment_staffId_periode_key" ON "StaffPayment"("staffId", "periode");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayment" ADD CONSTRAINT "StaffPayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayment" ADD CONSTRAINT "StaffPayment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
