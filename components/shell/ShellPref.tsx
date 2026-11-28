"use client";

/**
 * Which shell the person has chosen: the classic one (sidebar), the new
 * one (top menu bar, Specimen plate as Home) or the Field one (top menu
 * bar, the calm Field palette, Home as tiles). The root layout reads the
 * setting on the server and hands it down here, so the right shell is in
 * the first paint and nothing flashes.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { ShellChoice } from "@/lib/settings/uiPrefs";

export type ShellKind = ShellChoice;

const ShellContext = createContext<ShellKind>("classic");

export function ShellPrefProvider({ value, children }: { value: ShellKind; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShellKind(): ShellKind {
  return useContext(ShellContext);
}
