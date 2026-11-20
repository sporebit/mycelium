"use client";

/**
 * Which shell the person has chosen: the classic one (sidebar) or the new
 * one (top menu bar, Specimen plate as Home). The root layout reads the
 * setting on the server and hands it down here, so the right shell is in
 * the first paint and nothing flashes.
 */
import { createContext, useContext, type ReactNode } from "react";

export type ShellKind = "classic" | "new";

const ShellContext = createContext<ShellKind>("classic");

export function ShellPrefProvider({ value, children }: { value: ShellKind; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShellKind(): ShellKind {
  return useContext(ShellContext);
}
