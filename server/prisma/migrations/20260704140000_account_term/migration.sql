-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "interestPaid" TEXT,
ADD COLUMN     "maturityDate" TIMESTAMP(3),
ADD COLUMN     "termStart" TIMESTAMP(3);

