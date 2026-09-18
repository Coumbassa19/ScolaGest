-- CreateTable
CREATE TABLE "SchoolSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT NOT NULL DEFAULT 'Centre d''Excellence Académique',
    "type" TEXT NOT NULL DEFAULT 'Collège-Lycée',
    "address" TEXT NOT NULL DEFAULT 'Kindia, Région de Kindia, Guinée',
    "phone" TEXT NOT NULL DEFAULT '+224 622 123 456',
    "email" TEXT NOT NULL DEFAULT 'contact@cea-kindia.edu.gn',
    "logoUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);
