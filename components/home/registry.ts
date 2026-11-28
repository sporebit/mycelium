/**
 * The Home view registry (claude/ui-direction.md, build notes). Each view
 * is a component fed by the one Home data contract (lib/home/contract.ts).
 *
 * Two views are registered, each chosen by its shell rather than a toggle:
 * Specimen plate for the new shell, the tile grid for the Field shell
 * (docs/run/2026-11-28/field-guide-design.md §6). The other three decided
 * views (Core sample, Burrow, Colony) are not started, scaffolded or
 * stubbed here.
 */
import type { ComponentType } from "react";
import type { HomeData } from "@/lib/home/contract";
import type { ShellChoice } from "@/lib/settings/uiPrefs";
import { PlateView } from "./PlateView";
import { TilesView } from "./TilesView";

export type HomeViewProps = { data: HomeData; chime?: boolean };
export type HomeViewEntry = { key: string; label: string; Component: ComponentType<HomeViewProps> };

export const HOME_VIEWS: readonly HomeViewEntry[] = [
  { key: "plate", label: "Specimen plate", Component: PlateView },
  { key: "tiles", label: "Tiles", Component: TilesView },
];

export const DEFAULT_HOME_VIEW = "plate";

/** The Home view a shell opens on: the Field shell's tiles, otherwise the plate. */
export function defaultViewForShell(shell: ShellChoice): string {
  return shell === "field" ? "tiles" : DEFAULT_HOME_VIEW;
}

/** The view for a stored choice; an unknown or missing choice is the default. */
export function homeViewFor(key: string | null | undefined): HomeViewEntry {
  return HOME_VIEWS.find((v) => v.key === key) ?? HOME_VIEWS.find((v) => v.key === DEFAULT_HOME_VIEW) ?? HOME_VIEWS[0];
}
