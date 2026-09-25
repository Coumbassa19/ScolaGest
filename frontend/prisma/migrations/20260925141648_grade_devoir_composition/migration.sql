-- DropIndex
DROP INDEX "Grade_studentId_subjectId_periode_anneeScolaire_key";

-- DropIndex
DROP INDEX "GradeSubmission_classId_subjectId_periode_anneeScolaire_key";

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "label" TEXT NOT NULL DEFAULT 'Composition',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'COMPOSITION';

-- AlterTable
ALTER TABLE "GradeSubmission" ADD COLUMN     "label" TEXT NOT NULL DEFAULT 'Composition',
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'COMPOSITION';

-- AlterTable
ALTER TABLE "SchoolSettings" ADD COLUMN     "coefComposition" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "coefDevoir" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "Grade_studentId_subjectId_periode_anneeScolaire_type_label_key" ON "Grade"("studentId", "subjectId", "periode", "anneeScolaire", "type", "label");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSubmission_classId_subjectId_periode_anneeScolaire_typ_key" ON "GradeSubmission"("classId", "subjectId", "periode", "anneeScolaire", "type", "label");

