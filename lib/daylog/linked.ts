/**
 * Day log Part E — linked users (spec decisions 26, 30; §11 flag 3). A
 * People row can be linked to another Mycelium user who shares a team with
 * the caller; that user then sees the scenes their person was in, through
 * `daylog_shared_scenes` (0133) — date, place, names, narrative, shareable
 * photos, never a fact. Team membership is the consent step.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { signDaylogMedia, type MediaRow, type SignedMedia } from "./media";

export type Teammate = { user_id: string; display_name: string | null; teams: string[] };

/** Everyone who shares a team with the caller, with display names (RLS already scopes team_members to the caller's teams). */
export async function teammates(db: SupabaseClient, me: string): Promise<Teammate[]> {
  const [{ data: members }, { data: teams }] = await Promise.all([
    db.from("team_members").select("team_id, user_id").neq("user_id", me).limit(500),
    db.from("teams").select("id, name"),
  ]);
  const teamName = new Map(((teams ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
  const byUser = new Map<string, Set<string>>();
  for (const m of (members ?? []) as Array<{ team_id: string; user_id: string }>) {
    const set = byUser.get(m.user_id) ?? new Set<string>();
    set.add(teamName.get(m.team_id) ?? "team");
    byUser.set(m.user_id, set);
  }
  const ids = Array.from(byUser.keys());
  if (!ids.length) return [];
  const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", ids);
  const names = new Map(((profiles ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name]));
  return ids.map((id) => ({ user_id: id, display_name: names.get(id) ?? null, teams: Array.from(byUser.get(id) ?? []) })).sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));
}

export type SharedScene = {
  scene_id: string;
  day: string;
  scene_position: number;
  title: string;
  place_text: string | null;
  place_name: string | null;
  narrative: string | null;
  owner_name: string;
  participants: string[];
  photos: SignedMedia[];
};

type Row = Omit<SharedScene, "photos"> & { photos: Array<{ id: string; storage_path: string; caption: string | null }> };

/** As the viewer: the scenes shared with them in a date range (decision 30). */
export async function sharedScenes(db: SupabaseClient, from: string, to: string): Promise<SharedScene[]> {
  const { data, error } = await db.rpc("daylog_shared_scenes", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const out: SharedScene[] = [];
  for (const r of rows) {
    const media: MediaRow[] = (r.photos ?? []).map((p) => ({ id: p.id, day_id: "", scene_id: r.scene_id, storage_path: p.storage_path, taken_at: null, caption: p.caption, shareable: true, created_at: "" }));
    out.push({ ...r, photos: media.length ? await signDaylogMedia(db, media) : [] });
  }
  return out;
}
