/**
 * Weekly rundown renderer (P12 Part 6).
 *
 * Called ONCE PER RECIPIENT with a client that acts as that recipient
 * (lib/system/withUser), so every query below is filtered by RLS to what
 * the recipient's role and section toggles allow. Two members of the same
 * team with different toggles therefore get different issues, and a
 * section the recipient cannot see never contributes a line — the renderer
 * does not need to know about toggles at all.
 *
 * Content blocks (team owner's choice): changed (rows touched this week),
 * upcoming (due/scheduled in the next seven days), stats (row counts per
 * section), per_person (who contributed, by display name).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENTITY_GROUPS, OWNER_ONLY_SECTIONS } from "@/lib/access/registry";

export type RundownContent = { changed?: boolean; upcoming?: boolean; stats?: boolean; per_person?: boolean };

export type RundownInput = {
  teamId: string;
  teamName: string;
  teamSpaceId: string;
  /** ISO week label, e.g. 2026-W37. */
  week: string;
  weekStart: Date;
  weekEnd: Date;
  content: RundownContent;
  sections: string[];
  recipientName: string | null;
  /** Absolute origin for the in-app link. */
  origin: string;
};

export type RundownIssue = { html: string; text: string; lines: number; sectionsRendered: string[] };

/** Tables worth listing by title, with the column that names a row and the one that dates it. */
const TITLED: Record<string, { title: string; due?: string; changed?: string }> = {
  tickets: { title: "title", due: "due_date", changed: "updated_at" },
  events: { title: "title", due: "start_at", changed: "updated_at" },
  projects: { title: "name", changed: "updated_at" },
  people: { title: "name", changed: "updated_at" },
  workout_sessions: { title: "date", due: "date", changed: "updated_at" },
  workouts: { title: "name", changed: "updated_at" },
  recipes: { title: "title", changed: "updated_at" },
  shopping_lists: { title: "name", changed: "updated_at" },
  supplements: { title: "name", changed: "updated_at" },
  drops: { title: "name", due: "release_date", changed: "updated_at" },
  ventures: { title: "name", changed: "updated_at" },
  media_items: { title: "title", changed: "updated_at" },
  journal_entries: { title: "entry_date", changed: "updated_at" },
  places: { title: "name", changed: "updated_at" },
  reminders: { title: "title", due: "remind_at", changed: "updated_at" },
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function hasColumn(db: SupabaseClient, table: string, column: string): Promise<boolean> {
  // A zero-row probe: PostgREST answers 400 for an unknown column.
  const { error } = await db.from(table).select(column).limit(0);
  return !error;
}

export async function renderRundown(db: SupabaseClient, input: RundownInput): Promise<RundownIssue> {
  const sections = input.sections.filter((s) => !OWNER_ONLY_SECTIONS.includes(s as never));
  const groups = ENTITY_GROUPS.filter((g) => sections.includes(g.section));
  const since = input.weekStart.toISOString();
  const until = input.weekEnd.toISOString();
  const nextWeek = new Date(input.weekEnd.getTime() + 7 * 86400_000).toISOString();

  const bySection = new Map<string, { changed: string[]; upcoming: string[]; counts: Record<string, number>; people: Map<string, number> }>();
  const ensure = (s: string) => {
    let v = bySection.get(s);
    if (!v) {
      v = { changed: [], upcoming: [], counts: {}, people: new Map() };
      bySection.set(s, v);
    }
    return v;
  };

  for (const g of groups) {
    for (const table of g.tables) {
      const spec = TITLED[table];
      const sec = ensure(g.section);

      if (input.content.stats !== false) {
        const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq("space_id", input.teamSpaceId);
        if (typeof count === "number") sec.counts[table] = count;
      }
      if (!spec) continue;

      if (input.content.changed !== false && spec.changed && (await hasColumn(db, table, spec.changed))) {
        const { data } = await db
          .from(table)
          .select(`${spec.title}, ${spec.changed}, created_by`)
          .eq("space_id", input.teamSpaceId)
          .gte(spec.changed, since)
          .lte(spec.changed, until)
          .order(spec.changed, { ascending: false })
          .limit(15);
        for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
          sec.changed.push(`${table.replace(/_/g, " ")}: ${String(r[spec.title] ?? "")}`);
          const who = String(r.created_by ?? "");
          if (who) sec.people.set(who, (sec.people.get(who) ?? 0) + 1);
        }
      }
      if (input.content.upcoming !== false && spec.due && (await hasColumn(db, table, spec.due))) {
        const { data } = await db
          .from(table)
          .select(`${spec.title}, ${spec.due}`)
          .eq("space_id", input.teamSpaceId)
          .gte(spec.due, until.slice(0, 10))
          .lte(spec.due, nextWeek.slice(0, 10))
          .order(spec.due, { ascending: true })
          .limit(15);
        for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
          sec.upcoming.push(`${String(r[spec.due] ?? "").slice(0, 10)} · ${String(r[spec.title] ?? "")}`);
        }
      }
    }
  }

  // Names for per_person (teammates' profiles are readable).
  const names = new Map<string, string>();
  if (input.content.per_person) {
    const ids = [...new Set([...bySection.values()].flatMap((v) => [...v.people.keys()]))];
    if (ids.length) {
      const { data } = await db.from("profiles").select("id, display_name").in("id", ids);
      for (const p of data ?? []) names.set(p.id as string, (p.display_name as string | null) ?? (p.id as string).slice(0, 8));
    }
  }

  const link = `${input.origin}/rundowns/${encodeURIComponent(input.teamId)}/${input.week}`;
  const textLines: string[] = [`${input.teamName} — week ${input.week}`, ""];
  const htmlParts: string[] = [
    `<h1 style="font-family:sans-serif;font-size:20px">${esc(input.teamName)} <span style="color:#888">week ${esc(input.week)}</span></h1>`,
    input.recipientName ? `<p style="font-family:sans-serif;color:#666">For ${esc(input.recipientName)}.</p>` : "",
  ];
  const rendered: string[] = [];
  let lines = 0;

  for (const [section, v] of bySection) {
    const hasContent = v.changed.length || v.upcoming.length || Object.values(v.counts).some((n) => n > 0);
    if (!hasContent) continue;
    rendered.push(section);
    textLines.push(section.toUpperCase());
    htmlParts.push(`<h2 style="font-family:sans-serif;font-size:14px;letter-spacing:.1em;text-transform:uppercase;margin-top:20px">${esc(section)}</h2>`);
    if (input.content.changed !== false && v.changed.length) {
      textLines.push("  Changed this week:", ...v.changed.map((l) => `    - ${l}`));
      htmlParts.push(`<p style="font-family:sans-serif;margin:6px 0 2px"><strong>Changed this week</strong></p><ul style="font-family:sans-serif">${v.changed.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`);
      lines += v.changed.length;
    }
    if (input.content.upcoming !== false && v.upcoming.length) {
      textLines.push("  Coming up:", ...v.upcoming.map((l) => `    - ${l}`));
      htmlParts.push(`<p style="font-family:sans-serif;margin:6px 0 2px"><strong>Coming up</strong></p><ul style="font-family:sans-serif">${v.upcoming.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`);
      lines += v.upcoming.length;
    }
    if (input.content.stats !== false) {
      const stats = Object.entries(v.counts).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t.replace(/_/g, " ")}`);
      if (stats.length) {
        textLines.push(`  Totals: ${stats.join(", ")}`);
        htmlParts.push(`<p style="font-family:sans-serif;color:#666">${esc(stats.join(" · "))}</p>`);
        lines++;
      }
    }
    if (input.content.per_person && v.people.size) {
      const who = [...v.people.entries()].map(([id, n]) => `${names.get(id) ?? id.slice(0, 8)} (${n})`);
      textLines.push(`  By: ${who.join(", ")}`);
      htmlParts.push(`<p style="font-family:sans-serif;color:#666">By ${esc(who.join(", "))}</p>`);
      lines++;
    }
    textLines.push("");
  }

  if (rendered.length === 0) {
    textLines.push("Nothing to report this week.");
    htmlParts.push(`<p style="font-family:sans-serif;color:#666">Nothing to report this week.</p>`);
  }
  textLines.push(`Open in Mycelium: ${link}`);
  htmlParts.push(`<p style="font-family:sans-serif"><a href="${esc(link)}">Open in Mycelium</a></p>`);

  return { html: htmlParts.join("\n"), text: textLines.join("\n"), lines, sectionsRendered: rendered };
}

/** ISO week label and its Monday 00:00 UTC → Sunday 23:59:59 UTC bounds. */
export function isoWeek(date = new Date()): { week: string; start: Date; end: Date } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - 3);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday.getTime() + 7 * 86400_000 - 1);
  return { week: `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, start: monday, end: sunday };
}
