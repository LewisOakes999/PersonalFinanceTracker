-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "intervals" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "recoverySec" INTEGER;

-- AlterTable
ALTER TABLE "WorkoutPreset" ADD COLUMN     "intervals" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "recoverySec" INTEGER;

