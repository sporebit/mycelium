"use client";

import { useApi } from "@/lib/data/useApi";

export type ProjectOption = {
  id: string;
  name: string;
  colour: string | null;
  status: string;
  prefix?: string | null;
};

export type PersonOption = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export function personLabel(p: PersonOption): string {
  return p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Someone";
}

/** Active projects for the project picker (shared SWR key with /organisation/projects). */
export function useProjects() {
  const { data } = useApi<{ projects: ProjectOption[] }>("/api/projects");
  const projects = (data?.projects ?? []).filter((p) => p.status !== "archived");
  return projects;
}

export type AreaOption = { id: string; name: string; kind: "technical" | "life"; colour: string | null };

/** Areas (0116 + kind from 0121) for the project editor's area picker. */
export function useAreas() {
  const { data } = useApi<{ areas: AreaOption[] }>("/api/areas");
  return data?.areas ?? [];
}

/** People for the waiting-on picker. Never creates a Person. */
export function usePeople() {
  const { data } = useApi<{ people: PersonOption[] }>("/api/people");
  return data?.people ?? [];
}

/** JSON fetch helper that throws on non-2xx, for the write paths. */
export async function ticketFetch<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
