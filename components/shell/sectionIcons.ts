import {
  Inbox,
  KanbanSquare,
  Dumbbell,
  HeartPulse,
  PoundSterling,
  Palette,
  Rocket,
  ShoppingBag,
  Bot,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

// Section key → Lucide icon. Keeps Sidebar and TabBar in visual lockstep.
export const SECTION_ICONS: Record<string, LucideIcon> = {
  work: KanbanSquare,
  organisation: Inbox,
  fitness: Dumbbell,
  health: HeartPulse,
  finance: PoundSterling,
  studio: Palette,
  ventures: Rocket,
  drops: ShoppingBag,
  "the-boys": Bot,
  other: MoreHorizontal,
};
