-- CreateTable
CREATE TABLE "ParentMessage" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
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

    CONSTRAINT "ParentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentMessage_studentId_createdAt_idx" ON "ParentMessage"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ParentMessage_status_createdAt_idx" ON "ParentMessage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ParentMessage" ADD CONSTRAINT "ParentMessage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
