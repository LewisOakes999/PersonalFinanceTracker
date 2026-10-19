-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "segments" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "WorkoutPreset" ADD COLUMN     "segments" JSONB NOT NULL DEFAULT '[]';

