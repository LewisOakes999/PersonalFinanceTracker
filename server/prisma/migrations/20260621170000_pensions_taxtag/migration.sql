-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "isPension" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "taxTag" TEXT;

