/**
 * PhirstMaxx on the server: who is asking, which space, and the one write
 * every way in ends at (claude/phirstmaxx-spec.md §2.1, §5).
 *
 *   pmCtx()        the family space the caller belongs to (PhirstMaxx lives
 *                  in the family team's space, spec D5), seeded on first
 *                  visit with the starter block types and a pm_people row
 *                  per member.
 *   createDrop()   store the raw drop first, answer at once, research later:
 *                  the same client id twice is one drop; the research job
 *                  goes on the queue (kind "pm_research", lane cloud) and
 *                  the handler in lib/phirstmaxx/research/pipeline.ts takes
 *                  it from there.
 *   inbox tokens   per-person POST-only inbox (spec §5 "Anywhere"): the
 *                  token is shown once, its sha256 is kept.
 *
 * Nothing here touches another section's tables; that is adapter.ts's job.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { familyCtx, type FamilyCtx } from "@/lib/family/server";
import { enqueueJob } from "@/lib/jobs/queue";
import { sha256Hex } from "@/lib/system/apiTokens";
import type { DropSource, PmBlockType, PmDrop, PmPerson, PmPlace } from "./types";
import { DROP_SOURCES } from "./types";

export const RESEARCH_JOB = "pm_research";
export const PEOPLE_COLS = "id, person_id, name, colour, has_car, waking, buffers, home_place_id, settings, inbox_token_hint, updated_at";
export const PLACE_COLS = "id, label, address, lat, lng, kind, saved, person_id";
export const TYPE_COLS = "id, name, engine_kind, colour, default_firmness, default_place_id, is_seed, sort";
export const DROP_COLS = "id, person_id, client_id, source, url, text, media_paths, received_at, thing_id, question, answer, old_id";

/** A pm_people row with `id` set to the auth user id (what every other table calls person_id); `row_id` is the pm_people primary key. */
export type PmPersonRow = PmPerson & { row_id: string; person_id: string; settings: Record<string, unknown>; inbox_token_hint: string | null; updated_at: string };

export type PmCtx = FamilyCtx & {
  /** pm_people rows for the space, the caller first. */
  people: PmPersonRow[];
  me: PmPersonRow;
};

/**
 * The caller's PhirstMaxx context, or null when they have no family space.
 * Seeds the space the first time anyone opens the section.
 */
export async function pmCtx(supabase: SupabaseClient, uid: string, wanted?: string | null): Promise<PmCtx | null> {
  const fam = await familyCtx(supabase, uid, wanted);
  if (!fam) return null;
  let people = await listPeople(supabase, fam.spaceId);
  if (!people.some((p) => p.person_id === uid)) {
    const { error } = await supabase.rpc("pm_seed_space", { p_space: fam.spaceId });
    if (error) throw new Error(`PhirstMaxx could not be set up here: ${error.message}`);
    people = await listPeople(supabase, fam.spaceId);
  }
  const me = people.find((p) => p.person_id === uid);
  if (!me) throw new Error("You are not in this PhirstMaxx space.");
  return { ...fam, people: [me, ...people.filter((p) => p !== me)], me };
}

async function listPeople(supabase: SupabaseClient, spaceId: string): Promise<PmPersonRow[]> {
  const { data, error } = await supabase.from("pm_people").select(PEOPLE_COLS).eq("space_id", spaceId).order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ ...(r as unknown as PmPersonRow), row_id: r.id as string, id: r.person_id as string }));
}

export async function listPlaces(supabase: SupabaseClient, spaceId: string): Promise<PmPlace[]> {
  const { data, error } = await supabase.from("pm_places").select(PLACE_COLS).eq("space_id", spaceId).order("label");
  if (error) throw new Error(error.message);
  return (data ?? []) as PmPlace[];
}

export async function listBlockTypes(supabase: SupabaseClient, spaceId: string): Promise<PmBlockType[]> {
  const { data, error } = await supabase.from("pm_block_types").select(TYPE_COLS).eq("space_id", spaceId).order("sort");
  if (error) throw new Error(error.message);
  return (data ?? []) as PmBlockType[];
}

// ---------------------------------------------------------------------------
// Drops

export type DropInput = {
  /** The sender's id for this drop; the same id twice is one drop. */
  client_id: string;
  source: DropSource;
  url?: string | null;
  text?: string | null;
  /** Storage paths already written to the "phirstmaxx" bucket. */
  media_paths?: string[];
  received_at?: string;
  old_id?: string | null;
};

export type DropResult = { ok: true; drop: PmDrop; duplicate: boolean; status: 201 | 200 } | { ok: false; status: number; error: string };

const URL_RE = /^https?:\/\/\S+$/i;

/** Pull the first link out of shared text, and keep the rest as the caption. */
export function splitShared(text: string | null | undefined, url: string | null | undefined): { url: string | null; text: string | null } {
  let u = (url ?? "").trim() || null;
  let t = (text ?? "").trim() || null;
  if (!u && t) {
    const m = t.match(/https?:\/\/\S+/i);
    if (m) {
      u = m[0].replace(/[),.;!?]+$/, "");
      t = t.replace(m[0], "").trim() || null;
    }
  }
  if (u && !URL_RE.test(u)) u = null;
  return { url: u, text: t };
}

/**
 * Store the drop and queue its research. Never slow: one insert, one
 * enqueue. `personId` is who dropped it (the caller, or the inbox token's
 * owner, or the Telegram user).
 */
export async function createDrop(db: SupabaseClient, spaceId: string, personId: string, input: DropInput): Promise<DropResult> {
  const clientId = (input.client_id ?? "").trim();
  if (!clientId || clientId.length > 200) return { ok: false, status: 400, error: "A drop needs a client id." };
  if (!DROP_SOURCES.includes(input.source)) return { ok: false, status: 400, error: "Unknown source." };
  const { url, text } = splitShared(input.text, input.url);
  const media = (input.media_paths ?? []).filter((p) => typeof p === "string" && p.length > 0).slice(0, 10);
  if (!url && !text && media.length === 0) return { ok: false, status: 400, error: "Nothing to drop: no link, no words, no picture." };

  const row = {
    space_id: spaceId,
    person_id: personId,
    created_by: personId,
    client_id: clientId,
    source: input.source,
    url,
    text: text ? text.slice(0, 20_000) : null,
    media_paths: media,
    ...(input.received_at ? { received_at: input.received_at } : {}),
    old_id: input.old_id ?? null,
  };
  const ins = await db.from("pm_drops").insert(row).select(DROP_COLS).single();
  if (ins.error) {
    if (ins.error.code === "23505") {
      // the same client id again: the drop is already here (spec §2.1)
      const { data } = await db.from("pm_drops").select(DROP_COLS).eq("space_id", spaceId).eq("client_id", clientId).maybeSingle();
      if (data) return { ok: true, drop: data as PmDrop, duplicate: true, status: 200 };
    }
    return { ok: false, status: ins.error.code === "42501" ? 403 : 400, error: ins.error.message };
  }
  const drop = ins.data as PmDrop;
  await startResearch(db, spaceId, drop.id).catch((e) => console.error("[phirstmaxx] research enqueue:", e));
  return { ok: true, drop, duplicate: false, status: 201 };
}

/** Queue the research pipeline for a drop; harmless to call twice. */
export async function startResearch(db: SupabaseClient, spaceId: string, dropId: string, opts: { force?: boolean } = {}): Promise<void> {
  await enqueueJob(db, {
    kind: RESEARCH_JOB,
    payload: { space_id: spaceId, drop_id: dropId, force: !!opts.force },
    lane: "cloud",
    dedupeKey: `${RESEARCH_JOB}:${dropId}`,
    maxAttempts: 6,
  });
}

// ---------------------------------------------------------------------------
// Inbox tokens (spec §5 "Anywhere")

/** Mint a new inbox token for this person; the old one stops working. Returns the token once. */
export async function rotateInboxToken(db: SupabaseClient, spaceId: string, personId: string): Promise<string> {
  const token = `pmi_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const hash = await sha256Hex(token);
  const { error } = await db.from("pm_people").update({ inbox_token_hash: hash, inbox_token_hint: `…${token.slice(-4)}`, updated_at: new Date().toISOString() }).eq("space_id", spaceId).eq("person_id", personId);
  if (error) throw new Error(error.message);
  return token;
}

/** Who an inbox token belongs to, via a service client (the webhook has no session). */
export async function inboxOwner(service: SupabaseClient, token: string): Promise<{ space_id: string; person_id: string } | null> {
  if (!/^pmi_[0-9a-f]{40}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const { data } = await service.from("pm_people").select("space_id, person_id").eq("inbox_token_hash", hash).maybeSingle();
  return (data as { space_id: string; person_id: string } | null) ?? null;
}
