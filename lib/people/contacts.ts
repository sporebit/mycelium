/**
 * People contacts — the server half (people-contacts C1–C7): the one select,
 * merged-id resolution, contact points (numbers, emails), soft delete and
 * the bin, promote, merge (a database function), linked counts, export.
 * Everything runs through the caller's client so RLS is the wall.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalisePhone } from "./phones";
import type { Person, PersonEmail, PersonPhone, PersonWithAliases } from "./types";
import { buildVcf, type ExportPerson } from "./vcard";

/** Every column a people read returns (phone/email left the table in 0140). */
export const PERSON_SELECT =
  "id, first_name, last_name, display_name, relationship, birthday, address, where_we_met, mutual_interests, notes, needs_review, tier, deleted_at, merged_into_id, promoted_at, linked_user_id, created_at, updated_at, space_id";

export const PERSON_COLUMNS = ["first_name", "last_name", "display_name", "relationship", "birthday", "address", "where_we_met", "mutual_interests", "notes", "needs_review"] as const;

export type Tier = "person" | "contact";
export type TierFilter = Tier | "all";

export function parseTier(v: string | null | undefined, fallback: TierFilter = "person"): TierFilter {
  return v === "person" || v === "contact" || v === "all" ? v : fallback;
}

export function personName(p: { display_name: string | null; first_name: string | null; last_name: string | null }): string {
  return (p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "(unnamed)";
}

/**
 * A merged person's old id keeps working (C3): follow merged_into_id to the
 * survivor. Returns the live id, or null when nothing live is behind it.
 */
export async function resolvePersonId(db: SupabaseClient, id: string): Promise<{ id: string; resolvedFrom: string | null } | null> {
  let cur = id;
  let from: string | null = null;
  for (let hop = 0; hop < 6; hop++) {
    const { data } = await db.from("people").select("id, deleted_at, merged_into_id").eq("id", cur).maybeSingle();
    if (!data) return null;
    const row = data as { id: string; deleted_at: string | null; merged_into_id: string | null };
    if (!row.deleted_at) return { id: row.id, resolvedFrom: from };
    if (!row.merged_into_id) return null; // in the bin, not merged
    from = from ?? row.id;
    cur = row.merged_into_id;
  }
  return null;
}

// ---------------------------------------------------------------------
// contact points
// ---------------------------------------------------------------------

const PHONE_SELECT = "id, person_id, number_raw, number_e164, label, is_current, include_in_export, sort_order, created_at, updated_at";
const EMAIL_SELECT = "id, person_id, email, label, is_current, include_in_export, sort_order, created_at, updated_at";

function byOrder<T extends { sort_order: number; created_at: string }>(a: T, b: T): number {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

/** Phones and emails for a set of people, plus the derived `phone` / `email` (first current) the older screens still read. */
export async function attachContactPoints<T extends Person>(db: SupabaseClient, people: T[]): Promise<Array<T & { phones: PersonPhone[]; emails: PersonEmail[]; phone: string | null; email: string | null }>> {
  const ids = people.map((p) => p.id);
  const phonesBy = new Map<string, PersonPhone[]>();
  const emailsBy = new Map<string, PersonEmail[]>();
  if (ids.length) {
    const [ph, em] = await Promise.all([
      db.from("person_phones").select(PHONE_SELECT).in("person_id", ids),
      db.from("person_emails").select(EMAIL_SELECT).in("person_id", ids),
    ]);
    for (const r of (ph.data ?? []) as PersonPhone[]) phonesBy.set(r.person_id, [...(phonesBy.get(r.person_id) ?? []), r]);
    for (const r of (em.data ?? []) as PersonEmail[]) emailsBy.set(r.person_id, [...(emailsBy.get(r.person_id) ?? []), r]);
  }
  return people.map((p) => {
    const phones = (phonesBy.get(p.id) ?? []).sort(byOrder);
    const emails = (emailsBy.get(p.id) ?? []).sort(byOrder);
    const phone = phones.find((x) => x.is_current) ?? phones[0];
    const email = emails.find((x) => x.is_current) ?? emails[0];
    return { ...p, phones, emails, phone: phone ? (phone.number_e164 ?? phone.number_raw) : null, email: email?.email ?? null };
  });
}

export type PhoneInput = { number_raw: string; label?: string | null; is_current?: boolean; include_in_export?: boolean; sort_order?: number };
export type EmailInput = { email: string; label?: string | null; is_current?: boolean; include_in_export?: boolean; sort_order?: number };

/** Add a number; an existing identical number (same key) is returned untouched. */
export async function addPhone(db: SupabaseClient, personId: string, input: PhoneInput): Promise<PersonPhone | null> {
  const { raw, e164 } = normalisePhone(input.number_raw);
  if (!raw) return null;
  const count = input.sort_order === undefined ? (await db.from("person_phones").select("id", { count: "exact", head: true }).eq("person_id", personId)).count : null;
  const { data, error } = await db
    .from("person_phones")
    .upsert(
      {
        person_id: personId,
        number_raw: raw,
        number_e164: e164,
        label: input.label?.trim() || "mobile",
        is_current: input.is_current ?? true,
        include_in_export: input.include_in_export ?? input.is_current ?? true,
        sort_order: input.sort_order ?? count ?? 0,
      },
      { onConflict: "person_id,number_key", ignoreDuplicates: true },
    )
    .select(PHONE_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as PersonPhone;
  const { data: existing } = await db.from("person_phones").select(PHONE_SELECT).eq("person_id", personId).eq("number_key", e164 ?? raw.toLowerCase().replace(/[^0-9a-z+]/g, "")).maybeSingle();
  return (existing as PersonPhone | null) ?? null;
}

export async function addEmail(db: SupabaseClient, personId: string, input: EmailInput): Promise<PersonEmail | null> {
  const email = input.email.trim();
  if (!email || !email.includes("@")) return null;
  const count = input.sort_order === undefined ? (await db.from("person_emails").select("id", { count: "exact", head: true }).eq("person_id", personId)).count : null;
  const { data, error } = await db
    .from("person_emails")
    .upsert(
      {
        person_id: personId,
        email,
        label: input.label?.trim() || "home",
        is_current: input.is_current ?? true,
        include_in_export: input.include_in_export ?? input.is_current ?? true,
        sort_order: input.sort_order ?? count ?? 0,
      },
      { onConflict: "person_id,email_key", ignoreDuplicates: true },
    )
    .select(EMAIL_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as PersonEmail;
  const { data: existing } = await db.from("person_emails").select(EMAIL_SELECT).eq("person_id", personId).eq("email_key", email.toLowerCase()).maybeSingle();
  return (existing as PersonEmail | null) ?? null;
}

/**
 * A patch to a person: the people columns, plus the legacy `phone` / `email`
 * keys (the capture review's person kind, the registry) which become
 * contact points rather than being dropped.
 */
export async function applyPersonPatch(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<Person | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of PERSON_COLUMNS) if (patch[k] !== undefined) update[k] = patch[k];
  if (typeof patch.phone === "string" && patch.phone.trim()) await addPhone(db, id, { number_raw: patch.phone });
  if (typeof patch.email === "string" && patch.email.trim()) await addEmail(db, id, { email: patch.email });
  const { data, error } = await db.from("people").update(update).eq("id", id).select(PERSON_SELECT).single();
  if (error || !data) return null;
  return data as Person;
}

// ---------------------------------------------------------------------
// tier, delete, restore, merge, links
// ---------------------------------------------------------------------

export async function promotePerson(db: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await db.from("people").update({ tier: "person", promoted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("tier", "contact");
  return !error;
}

export async function softDeletePerson(db: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await db.from("people").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  return !error;
}

export async function restorePerson(db: SupabaseClient, id: string): Promise<boolean> {
  // a merged loser cannot come back on its own: its links now belong to the survivor
  const { error } = await db.from("people").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", id).is("merged_into_id", null);
  return !error;
}

export async function mergePeople(db: SupabaseClient, survivorId: string, loserId: string, fields: Record<string, unknown>): Promise<{ survivor: string; loser: string; moved: Record<string, number> }> {
  const { data, error } = await db.rpc("people_merge", { p_survivor: survivorId, p_loser: loserId, p_fields: fields });
  if (error) throw new Error(error.message);
  return data as { survivor: string; loser: string; moved: Record<string, number> };
}

export type LinkedCount = { table: string; column: string; count: number };

/** How many rows point at this person, per linking table (the delete dialog, C4). The table list comes from the database, not code. */
export async function linkedCounts(db: SupabaseClient, id: string): Promise<LinkedCount[]> {
  const { data } = await db.rpc("people_link_tables");
  const tables = (data ?? []) as Array<{ table_name: string; column_name: string }>;
  const out: LinkedCount[] = [];
  await Promise.all(
    tables.map(async (t) => {
      const { count } = await db.from(t.table_name).select("*", { count: "exact", head: true }).eq(t.column_name, id);
      if (count) out.push({ table: t.table_name, column: t.column_name, count });
    }),
  );
  return out.sort((a, b) => b.count - a.count);
}

export async function purgeDeletedPeople(db: SupabaseClient, days = 30): Promise<number> {
  const { data, error } = await db.rpc("people_purge_deleted", { p_days: days });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

// ---------------------------------------------------------------------
// export (C7)
// ---------------------------------------------------------------------

export async function exportPeopleVcf(db: SupabaseClient, tier: TierFilter): Promise<{ text: string; count: number }> {
  let q = db.from("people").select(PERSON_SELECT).is("deleted_at", null).order("last_name", { ascending: true, nullsFirst: false }).order("first_name");
  if (tier !== "all") q = q.eq("tier", tier);
  const { data, error } = await q;
  if (error) throw error;
  const people = await attachContactPoints(db, (data ?? []) as Person[]);
  const ids = people.map((p) => p.id);
  const cards = new Map<string, { uid: string; raw: string }>();
  if (ids.length) {
    const { data: vc } = await db.from("person_vcards").select("person_id, uid, raw, imported_at").in("person_id", ids).order("imported_at", { ascending: false });
    for (const r of (vc ?? []) as Array<{ person_id: string; uid: string; raw: string }>) if (!cards.has(r.person_id)) cards.set(r.person_id, { uid: r.uid, raw: r.raw });
  }
  const rows: ExportPerson[] = people.map((p) => {
    const card = cards.get(p.id);
    return {
      uid: card?.uid ?? `mycelium-person-${p.id}`,
      first_name: p.first_name,
      last_name: p.last_name,
      display_name: p.display_name,
      birthday: p.birthday,
      phones: p.phones.filter((x) => x.include_in_export).map((x) => ({ number_raw: x.number_raw, number_e164: x.number_e164, label: x.label })),
      emails: p.emails.filter((x) => x.include_in_export).map((x) => ({ email: x.email, label: x.label })),
      raw: card?.raw ?? null,
    };
  });
  return { text: buildVcf(rows), count: rows.length };
}

export type { PersonWithAliases };
