"use client";

/**
 * Home, as whichever registered view the person has chosen. With one view
 * registered there is nothing to choose and no toggle is shown.
 */
import type { HomeData } from "@/lib/home/contract";
import { homeViewFor } from "./registry";

export function HomeView({ data, view, chime = true }: { data: HomeData; view?: string | null; chime?: boolean }) {
  const { Component } = homeViewFor(view);
  return <Component data={data} chime={chime} />;
}
