-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "isInvestment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "volatility" DECIMAL(6,3) NOT NULL DEFAULT 0;

