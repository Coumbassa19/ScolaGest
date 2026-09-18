-- AlterTable
ALTER TABLE "Absence" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AcademicYear" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BulletinRemark" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Grade" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "RevenuePayment" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScheduleEntry" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SchoolClass" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SchoolMessage" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SchoolSettings" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Student" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Subject" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Teacher" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TeacherAssignment" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TeacherPayment" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TuitionPlan" ALTER COLUMN "schoolId" SET NOT NULL;

