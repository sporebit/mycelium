/**
 * The family space — server side (master run §8; 0171).
 *
 * The family space is the team space that holds a family_profile row.
 * Everything here runs as the caller, under the row rules: a team member
 * reads and writes, nobody else sees a thing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { londonClock } from "@/lib/daylog/day";
import { membersBySpace, namesFor, spaceLabels } from "@/lib/work/server";
import { summarise, type LogRow, type LogSummary } from "./babylog";
import { offsetFor, questionFor } from "./letters";
import { STARTER_LISTS } from "./starter";
import { babyAge, pregnancyOn, signpostsFor, type BabyAge, type Pregnancy } from "./weeks";

export const FAMILY_BUCKET = "family";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FamilyProfile = { id: string; space_id: string; due_on: string | null; born_on: string | null; baby_name: string | null; created_at: string };
export type FamilyMember = { id: string; name: string; me: boolean; acked: boolean };
export type FamilyCtx = { supabase: SupabaseClient; uid: string; spaceId: string; profile: FamilyProfile; members: FamilyMember[] };

const PROFILE = "id, space_id, due_on, born_on, baby_name, created_at";

/** Today in London, and the instant today began there. */
export function londonToday(now: Date = new Date()): { today: string; dayStart: Date } {
  const { date, minutes } = londonClock(now);
  return { today: date, dayStart: new Date(Math.floor(now.getTime() / 60_000) * 60_000 - minutes * 60_000) };
}

/** The caller's family space, or null when they are in none. `wanted` picks one when they are in two. */
export async function familyCtx(supabase: SupabaseClient, uid: string, wanted?: string | null): Promise<FamilyCtx | null> {
  let q = supabase.from("family_profile").select(PROFILE).order("created_at").limit(5);
  if (wanted && UUID_RE.test(wanted)) q = q.eq("space_id", wanted);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const profile = ((data ?? []) as FamilyProfile[])[0];
  if (!profile) return null;
  const [bySpace, acks] = await Promise.all([membersBySpace(supabase, uid, profile.space_id), supabase.from("family_acks").select("member_id").eq("space_id", profile.space_id)]);
  const ids = [...(bySpace.get(profile.space_id) ?? new Set([uid]))];
  const names = await namesFor(supabase, ids);
  const acked = new Set(((acks.data ?? []) as Array<{ member_id: string }>).map((a) => a.member_id));
  const members = ids
    .map((id) => ({ id, name: names.get(id) ?? "Someone", me: id === uid, acked: acked.has(id) }))
    .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name, "en-GB"));
  return { supabase, uid, spaceId: profile.space_id, profile, members };
}

/** The team spaces the caller could make the family space: theirs to see, and not one already. */
export async function candidateSpaces(supabase: SupabaseClient, uid: string): Promise<Array<{ id: string; label: string }>> {
  const [{ data: spaces }, { data: taken }] = await Promise.all([
    supabase.from("spaces").select("id, team_id").not("team_id", "is", null).limit(50),
    supabase.from("family_profile").select("space_id").limit(50),
  ]);
  const used = new Set(((taken ?? []) as Array<{ space_id: string }>).map((t) => t.space_id));
  const ids = ((spaces ?? []) as Array<{ id: string }>).map((s) => s.id).filter((id) => !used.has(id));
  return (await spaceLabels(supabase, uid, ids)).map((l) => ({ id: l.id, label: l.label }));
}

/**
 * Make a team's space the family space: the profile row and the starter
 * lists. Only a team's space: a personal space is one person's, and the
 * point of this one is that everything in it is shared.
 */
export async function setUpFamily(supabase: SupabaseClient, uid: string, spaceId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!UUID_RE.test(spaceId)) return { ok: false, status: 400, error: "space is a space id." };
  const { data: space } = await supabase.from("spaces").select("id, team_id").eq("id", spaceId).maybeSingle();
  if (!space) return { ok: false, status: 404, error: "No such space." };
  if (!(space as { team_id: string | null }).team_id) return { ok: false, status: 400, error: "The family space is a team's space. Create the team first, in Settings, People & teams." };
  const { error } = await supabase.from("family_profile").insert({ space_id: spaceId });
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, error: "That team already has a family space." };
    return { ok: false, status: error.code === "42501" ? 403 : 400, error: error.code === "42501" ? "Your role in that team cannot set this up." : error.message };
  }
  for (const [i, list] of STARTER_LISTS.entries()) {
    const { data: made, error: listErr } = await supabase.from("family_lists").insert({ space_id: spaceId, slug: list.slug, title: list.title, sort: i }).select("id").single();
    if (listErr || !made) continue; // a list that is already there is left as it is
    await supabase.from("family_list_items").insert(list.items.map((title, sort) => ({ space_id: spaceId, list_id: (made as { id: string }).id, title, sort })));
  }
  return { ok: true };
}

export type Upcoming = { id: string; title: string; starts_at: string; place: string | null };
export type Overview = {
  space_id: string;
  profile: FamilyProfile;
  members: FamilyMember[];
  today: string;
  pregnancy: (Pregnancy & { signposts: string[] }) | null;
  baby: BabyAge | null;
  upcoming: Upcoming[];
  letter: { week_of: string; question: string; answered_by: string[] };
  baby_log: LogSummary | null;
};

/** The top of the family page: where things stand today. */
export async function overview(ctx: FamilyCtx, now: Date = new Date()): Promise<Overview> {
  const { today, dayStart } = londonToday(now);
  const { supabase, spaceId, profile } = ctx;
  const q = questionFor(today, offsetFor(spaceId));
  const [upcoming, letters, log] = await Promise.all([
    supabase.from("family_entries").select("id, title, starts_at, place").eq("space_id", spaceId).eq("kind", "appointment").gte("starts_at", now.toISOString()).order("starts_at").limit(5),
    supabase.from("family_entries").select("created_by").eq("space_id", spaceId).eq("kind", "letter").eq("prompt", q.question).gte("happened_on", q.week_of),
    profile.born_on
      ? supabase.from("baby_log").select("id, kind, started_at, ended_at, detail, note, created_by").eq("space_id", spaceId).gte("started_at", new Date(now.getTime() - 48 * 3_600_000).toISOString()).order("started_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: null }),
  ]);
  const p = profile.due_on && !profile.born_on ? pregnancyOn(profile.due_on, today) : null;
  return {
    space_id: spaceId,
    profile,
    members: ctx.members,
    today,
    pregnancy: p ? { ...p, signposts: signpostsFor(p.week) } : null,
    baby: profile.born_on ? babyAge(profile.born_on, today) : null,
    upcoming: (upcoming.data ?? []) as Upcoming[],
    letter: { week_of: q.week_of, question: q.question, answered_by: [...new Set(((letters.data ?? []) as Array<{ created_by: string | null }>).map((l) => l.created_by).filter((x): x is string => !!x))] },
    baby_log: log.data ? summarise(log.data as LogRow[], now, dayStart) : null,
  };
}
