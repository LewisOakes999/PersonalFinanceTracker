-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "gearId" TEXT;

-- CreateTable
CREATE TABLE "Gear" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kinds" TEXT[],
    "transactionId" TEXT,
    "price" DECIMAL(10,2),
    "boughtOn" TIMESTAMP(3),
    "startKm" DECIMAL(8,1) NOT NULL DEFAULT 0,
    "lifespanKm" INTEGER,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gear_userId_idx" ON "Gear"("userId");

-- CreateIndex
CREATE INDEX "Workout_gearId_idx" ON "Workout"("gearId");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_gearId_fkey" FOREIGN KEY ("gearId") REFERENCES "Gear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gear" ADD CONSTRAINT "Gear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gear" ADD CONSTRAINT "Gear_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

