-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "cycleId" TEXT;

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "noteMax" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cycle_schoolId_idx" ON "Cycle"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_schoolId_name_key" ON "Cycle"("schoolId", "name");

-- CreateIndex
CREATE INDEX "SchoolClass_cycleId_idx" ON "SchoolClass"("cycleId");

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
