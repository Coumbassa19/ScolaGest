-- CreateTable
CREATE TABLE "BulletinRemark" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "observation" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulletinRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BulletinRemark_studentId_periode_key" ON "BulletinRemark"("studentId", "periode");

-- AddForeignKey
ALTER TABLE "BulletinRemark" ADD CONSTRAINT "BulletinRemark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
