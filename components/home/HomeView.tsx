"use client";

/**
 * Home, as whichever registered view the shell asks for (registry.ts,
 * defaultViewForShell). There is no toggle: the shell is the choice.
 */
import type { HomeData } from "@/lib/home/contract";
import { homeViewFor } from "./registry";

export function HomeView({ data, view, chime = true }: { data: HomeData; view?: string | null; chime?: boolean }) {
  const { Component } = homeViewFor(view);
  return <Component data={data} chime={chime} />;
}
