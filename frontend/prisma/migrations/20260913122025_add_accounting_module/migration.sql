-- AlterTable
ALTER TABLE "RevenuePayment" ADD COLUMN     "anneeScolaire" TEXT,
ADD COLUMN     "categorie" TEXT NOT NULL DEFAULT 'AUTRE',
ADD COLUMN     "periode" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "statut" TEXT NOT NULL DEFAULT 'NOUVEAU';

-- CreateTable
CREATE TABLE "TeacherPayment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moyenPaiement" TEXT NOT NULL DEFAULT 'ESPECES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TuitionPlan" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "anneeScolaire" TEXT NOT NULL,
    "montantAnnuel" INTEGER NOT NULL,

    CONSTRAINT "TuitionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherPayment_teacherId_idx" ON "TeacherPayment"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherPayment_periode_idx" ON "TeacherPayment"("periode");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPayment_teacherId_periode_key" ON "TeacherPayment"("teacherId", "periode");

-- CreateIndex
CREATE UNIQUE INDEX "TuitionPlan_classId_anneeScolaire_key" ON "TuitionPlan"("classId", "anneeScolaire");

-- CreateIndex
CREATE INDEX "RevenuePayment_categorie_idx" ON "RevenuePayment"("categorie");

-- AddForeignKey
ALTER TABLE "TeacherPayment" ADD CONSTRAINT "TeacherPayment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TuitionPlan" ADD CONSTRAINT "TuitionPlan_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
