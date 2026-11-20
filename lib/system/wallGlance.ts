/**
 * What the wall shows, gathered (master run §11). Lives in lib/system
 * because it acts as several people in one request: as the device for the
 * family space, as each person (read-only, numbers only) for their day, and
 * as the team's owner for the bins, which are the household's but kept in
 * the owner's space. Nothing here touches finance; the test in lib/wall
 * keeps it that way.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBinConfig, loadGardenSeasons } from "@/lib/bins/config";
import { collectionLabel, getNextCollection } from "@/lib/bins/schedule";
import { fetchWeather } from "@/lib/briefings/weather";
import { familyCtx, overview } from "@/lib/family/server";
import { daysBetween } from "@/lib/family/weeks";
import { ago } from "@/lib/family/babylog";
import { peekHome } from "@/lib/home/data";
import { todayLondon } from "@/lib/tickets/when";
import type { WallFamily, WallGlance, WallPerson, WallPhoto, WallSaying } from "@/lib/wall/contract";
import { peopleWithUnlock } from "./quickUnlock";
import { createServiceClient } from "./serviceClient";
import { type WallDevice, teamPeople } from "./wall";
import { withUser } from "./withUser";

const london = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", ...opts });

async function quietly<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[wall] ${what} failed:`, err);
    return fallback;
  }
}

/** "Tomorrow 10:30", "Thu 14:00", "Today 09:15". */
export function whenLabel(iso: string, now: Date): string {
  const today = todayLondon(now);
  const day = todayLondon(new Date(iso));
  const time = london({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const gap = daysBetween(today, day);
  if (gap === 0) return `Today ${time}`;
  if (gap === 1) return `Tomorrow ${time}`;
  return `${london({ weekday: "short" }).format(new Date(iso))} ${time}`;
}

async function familyPart(db: SupabaseClient, deviceUid: string, teamSpaceId: string, now: Date): Promise<WallFamily | null> {
  const ctx = await familyCtx(db, deviceUid, teamSpaceId);
  if (!ctx) return null;
  const o = await overview(ctx, now);
  let countdown: string | null = null;
  if (o.baby) countdown = `${o.profile.baby_name?.trim() || "Baby"} is ${o.baby.label}`;
  else if (o.pregnancy) countdown = o.pregnancy.days_to_go > 0 ? `Baby in ${o.pregnancy.days_to_go} ${o.pregnancy.days_to_go === 1 ? "day" : "days"} · week ${o.pregnancy.week}` : `Due date was ${-o.pregnancy.days_to_go} days ago`;
  let baby_line: string | null = null;
  const log = o.baby_log;
  if (log?.asleep) baby_line = `Asleep for ${Math.round(log.asleep.minutes)} min`;
  else if (log?.last_feed) baby_line = `Last feed ${ago(log.last_feed.minutes_ago)}${log.last_feed.how ? `, ${log.last_feed.how}` : ""}`;
  return {
    countdown,
    upcoming: o.upcoming.slice(0, 5).map((u) => ({ id: u.id, title: u.title, starts_at: u.starts_at, place: u.place, when: whenLabel(u.starts_at, now) })),
    baby_line,
  };
}

async function personPart(uid: string, name: string, canUnlock: boolean, now: Date): Promise<WallPerson> {
  const home = await quietly(`today for a person`, () => withUser(uid, (db) => peekHome(db, uid, now)), null);
  const minutesLeft = home ? home.items.filter((i) => i.state !== "done").reduce((n, i) => n + i.minutes, 0) : 0;
  return {
    id: uid,
    name,
    can_unlock: canUnlock,
    today: home ? { ...home.today.counts, minutes_left: minutesLeft } : null,
    week: home ? home.week.days.map((d) => (d.is_future ? -1 : d.done)) : [],
    hours_left: home?.hours?.left ?? null,
  };
}

async function binsPart(ownerUid: string | null, now: Date): Promise<WallGlance["bins"]> {
  if (!ownerUid) return null;
  return withUser(ownerUid, async (db) => {
    const config = await loadBinConfig(db);
    if (!config) return null;
    const next = getNextCollection(now, config, await loadGardenSeasons(db));
    return { date: next.date, label: collectionLabel(next), days: daysBetween(todayLondon(now), next.date) };
  });
}

/** The family board, as the device sees it. `db` is the device's own client. */
export async function loadGlance(db: SupabaseClient, device: WallDevice, now: Date = new Date()): Promise<WallGlance> {
  const found = await teamPeople(device.team_space_id);
  const people = found?.people ?? [];
  const unlockable = await peopleWithUnlock(people.map((p) => p.id));
  const [family, persons, weather, bins] = await Promise.all([
    quietly("family", () => familyPart(db, device.device_user_id, device.team_space_id, now), null),
    Promise.all(people.map((p) => personPart(p.id, p.name, unlockable.has(p.id), now))),
    quietly("weather", () => fetchWeather(), null),
    quietly("bins", () => binsPart(found?.team.owner_user_id ?? null, now), null),
  ]);
  return {
    device: { id: device.id, label: device.label },
    day_label: london({ weekday: "long", day: "numeric", month: "long" }).format(now),
    drawn_at: london({ hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    people: persons,
    family,
    weather,
    bins,
  };
}

/** Kinds that are never spoken on the wall, whatever a row says: anything from the finance stream. */
const NEVER_SAID = new Set(["bill", "budget", "subscription", "unusual"]);

/**
 * Things to say aloud: wall-channel interruption rows for the team's people
 * from the last ten minutes, not yet spoken. Each is marked acted as it is
 * handed over, so it is said once. Service read: the rows are the people's
 * own, and the device may not read them itself.
 */
export async function thingsToSay(device: WallDevice, now: Date = new Date()): Promise<WallSaying[]> {
  const found = await teamPeople(device.team_space_id);
  const ids = (found?.people ?? []).map((p) => p.id);
  if (!ids.length) return [];
  const svc = createServiceClient();
  const since = new Date(now.getTime() - 10 * 60_000).toISOString();
  const { data } = await svc.from("interruptions").select("id, kind, title").eq("channel", "wall").is("acted_at", null).gte("at", since).in("created_by", ids).order("at").limit(5);
  const rows = ((data ?? []) as Array<{ id: string; kind: string; title: string }>).filter((r) => !NEVER_SAID.has(r.kind) && r.title?.trim());
  if (!rows.length) return [];
  await svc.from("interruptions").update({ acted_at: now.toISOString(), action: "spoken" }).in("id", rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, text: r.title.trim() }));
}

/** Pictures from the family space, newest first, as fifteen-minute links. The device reads them under its own membership. */
export async function familyPhotos(db: SupabaseClient, teamSpaceId: string, limit = 30): Promise<WallPhoto[]> {
  const { data } = await db.from("family_entries").select("id, title, happened_on, media_path, media_mime").eq("space_id", teamSpaceId).like("media_mime", "image/%").order("created_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as Array<{ id: string; title: string | null; happened_on: string | null; media_path: string | null }>;
  const paths = rows.map((r) => r.media_path).filter((p): p is string => !!p);
  if (!paths.length) return [];
  const { data: signed } = await db.storage.from("family").createSignedUrls(paths, 900);
  const urls = new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
  return rows.filter((r) => r.media_path && urls.has(r.media_path)).map((r) => ({ id: r.id, url: urls.get(r.media_path as string) as string, title: r.title, taken: r.happened_on }));
}
