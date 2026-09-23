-- CreateTable
CREATE TABLE "GradeSubmission" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "anneeScolaire" TEXT NOT NULL,
    "proofUrl" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correctedById" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctionNote" TEXT,

    CONSTRAINT "GradeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeSubmission_schoolId_idx" ON "GradeSubmission"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeSubmission_classId_subjectId_periode_anneeScolaire_key" ON "GradeSubmission"("classId", "subjectId", "periode", "anneeScolaire");

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

