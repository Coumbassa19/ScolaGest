-- CreateTable
CREATE TABLE "ParentStudent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'TUTEUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentStudent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentStudent_parentUserId_idx" ON "ParentStudent"("parentUserId");

-- CreateIndex
CREATE INDEX "ParentStudent_studentId_idx" ON "ParentStudent"("studentId");

-- CreateIndex
CREATE INDEX "ParentStudent_schoolId_idx" ON "ParentStudent"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentStudent_parentUserId_studentId_key" ON "ParentStudent"("parentUserId", "studentId");

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

