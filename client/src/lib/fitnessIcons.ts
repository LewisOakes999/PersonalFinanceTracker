import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  PersonStanding,
  Trophy,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { WorkoutKind } from "../types";

export const KIND_ICONS: Record<WorkoutKind, LucideIcon> = {
  strength: Dumbbell,
  run: Footprints,
  cycle: Bike,
  swim: Waves,
  walk: PersonStanding,
  class: Users,
  sport: Trophy,
  other: Activity,
};
