-- AlterTable
ALTER TABLE "Grade" ADD COLUMN "anneeScolaire" TEXT NOT NULL DEFAULT '2024-2025';

-- DropIndex
DROP INDEX "Grade_studentId_subjectId_periode_key";

-- DropIndex
DROP INDEX "Grade_classId_subjectId_periode_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Grade_studentId_subjectId_periode_anneeScolaire_key" ON "Grade"("studentId", "subjectId", "periode", "anneeScolaire");

-- CreateIndex
CREATE INDEX "Grade_classId_subjectId_periode_anneeScolaire_idx" ON "Grade"("classId", "subjectId", "periode", "anneeScolaire");
