-- DropIndex
DROP INDEX "AcademicYear_label_key";

-- DropIndex
DROP INDEX "RevenuePayment_numeroRecu_key";

-- DropIndex
DROP INDEX "SchoolClass_name_key";

-- DropIndex
DROP INDEX "Student_matricule_key";

-- DropIndex
DROP INDEX "Subject_code_key";

-- AlterTable
ALTER TABLE "Absence" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "BulletinRemark" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "RevenuePayment" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "SchoolMessage" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "SchoolSettings" ADD COLUMN     "schoolId" TEXT,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "TeacherAssignment" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "TeacherPayment" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "TuitionPlan" ADD COLUMN     "schoolId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "schoolId" TEXT;

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");

-- CreateIndex
CREATE INDEX "School_status_idx" ON "School"("status");

-- CreateIndex
CREATE INDEX "Absence_schoolId_idx" ON "Absence"("schoolId");

-- CreateIndex
CREATE INDEX "AcademicYear_schoolId_idx" ON "AcademicYear"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_label_key" ON "AcademicYear"("schoolId", "label");

-- CreateIndex
CREATE INDEX "BulletinRemark_schoolId_idx" ON "BulletinRemark"("schoolId");

-- CreateIndex
CREATE INDEX "Grade_schoolId_idx" ON "Grade"("schoolId");

-- CreateIndex
CREATE INDEX "RevenuePayment_schoolId_idx" ON "RevenuePayment"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenuePayment_schoolId_numeroRecu_key" ON "RevenuePayment"("schoolId", "numeroRecu");

-- CreateIndex
CREATE INDEX "ScheduleEntry_schoolId_idx" ON "ScheduleEntry"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolClass_schoolId_idx" ON "SchoolClass"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_schoolId_name_key" ON "SchoolClass"("schoolId", "name");

-- CreateIndex
CREATE INDEX "SchoolMessage_schoolId_idx" ON "SchoolMessage"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSettings_schoolId_key" ON "SchoolSettings"("schoolId");

-- CreateIndex
CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_matricule_key" ON "Student"("schoolId", "matricule");

-- CreateIndex
CREATE INDEX "Subject_schoolId_idx" ON "Subject"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolId_code_key" ON "Subject"("schoolId", "code");

-- CreateIndex
CREATE INDEX "Teacher_schoolId_idx" ON "Teacher"("schoolId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_schoolId_idx" ON "TeacherAssignment"("schoolId");

-- CreateIndex
CREATE INDEX "TeacherPayment_schoolId_idx" ON "TeacherPayment"("schoolId");

-- CreateIndex
CREATE INDEX "TuitionPlan_schoolId_idx" ON "TuitionPlan"("schoolId");

-- CreateIndex
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulletinRemark" ADD CONSTRAINT "BulletinRemark_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPayment" ADD CONSTRAINT "TeacherPayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TuitionPlan" ADD CONSTRAINT "TuitionPlan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAssignment" ADD CONSTRAINT "TeacherAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenuePayment" ADD CONSTRAINT "RevenuePayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

