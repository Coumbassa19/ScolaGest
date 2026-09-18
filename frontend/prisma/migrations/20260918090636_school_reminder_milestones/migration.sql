-- AlterTable
ALTER TABLE "School" DROP COLUMN "renewalReminderSentAt",
ADD COLUMN     "remindersSentDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
