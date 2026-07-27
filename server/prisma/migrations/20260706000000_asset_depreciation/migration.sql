-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "depreciates" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "valueDate" TIMESTAMP(3);

