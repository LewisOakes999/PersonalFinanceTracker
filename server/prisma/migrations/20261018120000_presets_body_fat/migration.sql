-- AlterTable
ALTER TABLE "BodyWeight" ADD COLUMN     "bodyFatPct" DECIMAL(4,1);

-- CreateTable
CREATE TABLE "WorkoutPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "durationSec" INTEGER,
    "distanceKm" DECIMAL(8,3),
    "sets" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPreset_userId_name_key" ON "WorkoutPreset"("userId", "name");

-- AddForeignKey
ALTER TABLE "WorkoutPreset" ADD CONSTRAINT "WorkoutPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

