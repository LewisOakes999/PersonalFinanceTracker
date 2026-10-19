import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  PersonStanding,
  Trophy,
  Users,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { WorkoutKind } from "../types";

export const KIND_ICONS: Record<WorkoutKind, LucideIcon> = {
  strength: Dumbbell,
  run: Footprints,
  cycle: Bike,
  swim: Waves,
  walk: PersonStanding,
  hybrid: Zap,
  class: Users,
  sport: Trophy,
  other: Activity,
};
