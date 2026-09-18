/*
  Warnings:

  - You are about to drop the `ParentMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ParentMessage" DROP CONSTRAINT "ParentMessage_studentId_fkey";

-- DropTable
DROP TABLE "ParentMessage";

-- CreateTable
CREATE TABLE "SchoolMessage" (
    "id" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "studentId" TEXT,
    "teacherId" TEXT,
    "channel" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorReason" TEXT,
    "emailJobId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolMessage_studentId_createdAt_idx" ON "SchoolMessage"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolMessage_teacherId_createdAt_idx" ON "SchoolMessage"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolMessage_status_createdAt_idx" ON "SchoolMessage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
