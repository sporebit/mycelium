/**
 * The Home view registry (claude/ui-direction.md, build notes). Each view
 * is a component fed by the one Home data contract (lib/home/contract.ts).
 *
 * Only Specimen plate is registered. The other three decided views (Core
 * sample, Burrow, Colony) are not started, scaffolded or stubbed here: the
 * registry and the data contract are the whole of the preparation, and
 * they are built when Phil says so. There is no visible toggle while there
 * is one view; it appears when a second is registered.
 */
import type { ComponentType } from "react";
import type { HomeData } from "@/lib/home/contract";
import { PlateView } from "./PlateView";

export type HomeViewProps = { data: HomeData; chime?: boolean };
export type HomeViewEntry = { key: string; label: string; Component: ComponentType<HomeViewProps> };

export const HOME_VIEWS: readonly HomeViewEntry[] = [{ key: "plate", label: "Specimen plate", Component: PlateView }];

export const DEFAULT_HOME_VIEW = "plate";

/** The view for a stored choice; an unknown or missing choice is the default. */
export function homeViewFor(key: string | null | undefined): HomeViewEntry {
  return HOME_VIEWS.find((v) => v.key === key) ?? HOME_VIEWS.find((v) => v.key === DEFAULT_HOME_VIEW) ?? HOME_VIEWS[0];
}
