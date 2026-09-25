/**
 * vCard import (people-contacts C2): a batch, idempotent on the card's UID
 * (or the content hash when it has none), never an automatic merge. A card
 * that matches someone on an E.164 number, a lower-cased email or a name
 * trigram ≥ 0.6 waits in people_import_candidates for Merge / Keep separate
 * / Skip; every other card becomes a contact straight away.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { similarity } from "@/lib/quotes/text";
import { normaliseAlias } from "./normalise";
import { addEmail, addPhone, PERSON_SELECT, personName } from "./contacts";
import { parseVcf, type ParsedCard } from "./vcard";

export const NAME_MATCH_THRESHOLD = 0.6;

export type ImportSummary = {
  batch_id: string;
  card_count: number;
  imported: number;
  review: number;
  skipped: number;
  failed: number;
  unparseable: number;
  /** false when the time budget ran out first: call again with the same file and `batch_id` to continue. */
  done: boolean;
  /** cards handled in this call */
  processed: number;
};

/** Vercel's function limit is the wall; stop well inside it and let the caller resume. */
export const DEFAULT_BUDGET_MS = 45_000;

type Live = { id: string; name: string; first_name: string; last_name: string | null; display_name: string | null };

type Index = {
  byUid: Set<string>;
  /** uids this batch itself has already handled (for a resumed run) */
  thisBatch: Set<string>;
  byPhone: Map<string, string>;
  byEmail: Map<string, string>;
  people: Live[];
};

async function loadIndex(db: SupabaseClient, batchId: string | null = null): Promise<Index> {
  const [{ data: people }, { data: phones }, { data: emails }, { data: vcards }, { data: candidates }] = await Promise.all([
    db.from("people").select("id, first_name, last_name, display_name").is("deleted_at", null),
    db.from("person_phones").select("person_id, number_e164").not("number_e164", "is", null),
    db.from("person_emails").select("person_id, email_key"),
    db.from("person_vcards").select("uid"),
    // a card already waiting for (or given) a decision is handled too — re-importing never re-offers it
    db.from("people_import_candidates").select("uid").not("uid", "is", null),
  ]);
  const live = ((people ?? []) as Array<{ id: string; first_name: string; last_name: string | null; display_name: string | null }>).map((p) => ({ ...p, name: personName(p) }));
  const liveIds = new Set(live.map((p) => p.id));
  const byPhone = new Map<string, string>();
  for (const r of (phones ?? []) as Array<{ person_id: string; number_e164: string }>) if (liveIds.has(r.person_id) && !byPhone.has(r.number_e164)) byPhone.set(r.number_e164, r.person_id);
  const byEmail = new Map<string, string>();
  for (const r of (emails ?? []) as Array<{ person_id: string; email_key: string }>) if (liveIds.has(r.person_id) && !byEmail.has(r.email_key)) byEmail.set(r.email_key, r.person_id);
  const byUid = new Set(((vcards ?? []) as Array<{ uid: string }>).map((v) => v.uid));
  for (const c of (candidates ?? []) as Array<{ uid: string | null }>) if (c.uid) byUid.add(c.uid);
  const thisBatch = new Set<string>();
  if (batchId) {
    const [{ data: v2 }, { data: c2 }] = await Promise.all([
      db.from("person_vcards").select("uid").eq("batch_id", batchId),
      db.from("people_import_candidates").select("uid").eq("batch_id", batchId),
    ]);
    for (const r of [...((v2 ?? []) as Array<{ uid: string | null }>), ...((c2 ?? []) as Array<{ uid: string | null }>)]) if (r.uid) thisBatch.add(r.uid);
  }
  return { byUid, thisBatch, byPhone, byEmail, people: live };
}

export type Match = { person_id: string; reason: "phone" | "email" | "name"; score: number };

export function findMatch(card: ParsedCard, index: Index): Match | null {
  for (const p of card.phones) if (p.e164 && index.byPhone.has(p.e164)) return { person_id: index.byPhone.get(p.e164)!, reason: "phone", score: 1 };
  for (const e of card.emails) {
    const key = e.value.trim().toLowerCase();
    if (index.byEmail.has(key)) return { person_id: index.byEmail.get(key)!, reason: "email", score: 1 };
  }
  const name = card.fn || [card.n.given, card.n.family].filter(Boolean).join(" ");
  if (!name) return null;
  let best: Match | null = null;
  for (const p of index.people) {
    const s = Math.max(similarity(name, p.name), similarity(name, [p.first_name, p.last_name].filter(Boolean).join(" ")));
    if (s >= NAME_MATCH_THRESHOLD && (!best || s > best.score)) best = { person_id: p.id, reason: "name", score: Math.round(s * 100) / 100 };
  }
  return best;
}

function namesOf(card: ParsedCard): { first: string; last: string | null; display: string | null } {
  const given = card.n.given.trim();
  const family = card.n.family.trim();
  if (given) return { first: given, last: family || null, display: card.fn && card.fn !== [given, family].filter(Boolean).join(" ") ? card.fn : null };
  const parts = (card.fn || card.org || "Unknown").trim().split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") || null, display: null };
}

/** Create a person from a card as a contact (or into an existing person on merge), with numbers, emails, aliases and the raw card. */
export async function materialiseCard(db: SupabaseClient, card: ParsedCard, opts: { batchId: string | null; into?: string | null; tier?: "contact" | "person" }): Promise<string> {
  let personId = opts.into ?? null;
  if (!personId) {
    const { first, last, display } = namesOf(card);
    const { data, error } = await db
      .from("people")
      .insert({
        first_name: first,
        last_name: last,
        display_name: display,
        birthday: card.birthday,
        address: card.address,
        tier: opts.tier ?? "contact",
        needs_review: false,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "person insert failed");
    personId = (data as { id: string }).id;
    const aliases = new Set<string>();
    const primary = normaliseAlias(display || [first, last].filter(Boolean).join(" ") || first);
    aliases.add(primary);
    const firstAlias = normaliseAlias(first);
    if (firstAlias) aliases.add(firstAlias);
    await db.from("people_aliases").upsert(
      Array.from(aliases).map((alias) => ({ person_id: personId, alias, is_primary: alias === primary })),
      { onConflict: "person_id,alias", ignoreDuplicates: true },
    );
  } else {
    // merging into an existing person: fill empty fields only
    const { data: cur } = await db.from("people").select(PERSON_SELECT).eq("id", personId).maybeSingle();
    const c = cur as { birthday: string | null; address: string | null } | null;
    const patch: Record<string, unknown> = {};
    if (c && !c.birthday && card.birthday) patch.birthday = card.birthday;
    if (c && !c.address && card.address) patch.address = card.address;
    if (Object.keys(patch).length) await db.from("people").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", personId);
    const alias = normaliseAlias(card.fn || card.n.given);
    if (alias) await db.from("people_aliases").upsert({ person_id: personId, alias, is_primary: false }, { onConflict: "person_id,alias", ignoreDuplicates: true });
  }
  let i = 0;
  for (const p of card.phones) await addPhone(db, personId, { number_raw: p.raw, label: p.label, sort_order: i++ });
  i = 0;
  for (const e of card.emails) await addEmail(db, personId, { email: e.value, label: e.label, sort_order: i++ });
  await db.from("person_vcards").upsert({ person_id: personId, uid: card.uid, raw: card.raw, version: card.version, batch_id: opts.batchId }, { onConflict: "space_id,uid", ignoreDuplicates: true });
  return personId;
}

/**
 * The batch's imported / review counts are derived from rows (a decided
 * candidate writes one vCard row with the batch id), skipped / failed are
 * accumulated across runs, so an interrupted or resumed run never loses or
 * double-counts anything.
 */
async function finishBatch(db: SupabaseClient, batchId: string, run: { skipped: number; failed: number }, done: boolean): Promise<{ imported: number; review: number; skipped: number; failed: number }> {
  const [{ count: vcards }, { count: candidates }, { count: decided }, { data: cur }] = await Promise.all([
    db.from("person_vcards").select("id", { count: "exact", head: true }).eq("batch_id", batchId),
    db.from("people_import_candidates").select("id", { count: "exact", head: true }).eq("batch_id", batchId),
    db.from("people_import_candidates").select("id", { count: "exact", head: true }).eq("batch_id", batchId).in("decision", ["merged", "separate"]),
    db.from("people_import_batches").select("skipped, failed").eq("id", batchId).maybeSingle(),
  ]);
  const prev = (cur as { skipped: number; failed: number } | null) ?? { skipped: 0, failed: 0 };
  const counts = {
    imported: Math.max(0, (vcards ?? 0) - (decided ?? 0)),
    review: candidates ?? 0,
    skipped: prev.skipped + run.skipped,
    failed: prev.failed + run.failed,
  };
  await db
    .from("people_import_batches")
    .update({ ...counts, status: done ? "done" : "running", finished_at: done ? new Date().toISOString() : null })
    .eq("id", batchId);
  return counts;
}

export async function importVcf(
  db: SupabaseClient,
  input: { filename: string | null; text: string; batchId?: string | null; budgetMs?: number },
): Promise<ImportSummary> {
  const started = Date.now();
  const budget = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const { cards, unparseable } = parseVcf(input.text);
  let batchId = input.batchId ?? null;
  let runFailed = 0;
  if (batchId) {
    const { data: existing } = await db.from("people_import_batches").select("id").eq("id", batchId).maybeSingle();
    if (!existing) throw new Error("batch not found");
  } else {
    const { data: batchRow, error: batchErr } = await db
      .from("people_import_batches")
      .insert({ filename: input.filename, card_count: cards.length + unparseable })
      .select("id")
      .single();
    if (batchErr || !batchRow) throw new Error(batchErr?.message ?? "batch insert failed");
    batchId = (batchRow as { id: string }).id;
    runFailed += unparseable; // counted once, on the run that opened the batch
  }
  const index = await loadIndex(db, input.batchId ?? null);
  const seenThisRun = new Set<string>();
  let runSkipped = 0;
  let processed = 0;
  let done = true;
  for (let i = 0; i < cards.length; i++) {
    if (Date.now() - started > budget) {
      done = false;
      break;
    }
    const card = cards[i];
    processed += 1;
    try {
      if (index.byUid.has(card.uid) || seenThisRun.has(card.uid)) {
        // already imported or waiting for a decision (idempotent on UID, C2);
        // on a resumed batch the cards this batch already handled are not "skipped"
        if (!input.batchId || !index.thisBatch.has(card.uid)) runSkipped += 1;
        continue;
      }
      seenThisRun.add(card.uid);
      const match = findMatch(card, index);
      if (match) {
        const { error } = await db.from("people_import_candidates").insert({
          batch_id: batchId,
          card_index: i,
          uid: card.uid,
          raw: card.raw,
          parsed: { ...card, raw: undefined },
          match_person_id: match.person_id,
          match_reason: match.reason,
          match_score: match.score,
        });
        if (error) throw error;
        continue;
      }
      const id = await materialiseCard(db, card, { batchId, tier: "contact" });
      // later cards in the same file can match this one
      for (const p of card.phones) if (p.e164 && !index.byPhone.has(p.e164)) index.byPhone.set(p.e164, id);
      for (const e of card.emails) index.byEmail.set(e.value.trim().toLowerCase(), id);
      index.people.push({ id, name: card.fn, first_name: card.n.given || card.fn, last_name: card.n.family || null, display_name: null });
    } catch (err) {
      console.error("[people import] card failed:", err instanceof Error ? err.message : err);
      runFailed += 1;
    }
  }
  const counts = await finishBatch(db, batchId, { skipped: runSkipped, failed: runFailed }, done);
  return { batch_id: batchId, card_count: cards.length + unparseable, ...counts, unparseable, done, processed };
}

export type Decision = "merge" | "separate" | "skip";

/** Resolve one review row. Merge = into the matched (or chosen) person; separate = a new contact; skip = nothing. */
export async function decideCandidate(db: SupabaseClient, candidateId: string, decision: Decision, into?: string | null): Promise<{ person_id: string | null }> {
  const { data, error } = await db.from("people_import_candidates").select("id, batch_id, raw, parsed, match_person_id, decision").eq("id", candidateId).maybeSingle();
  if (error || !data) throw new Error("candidate not found");
  const row = data as { id: string; batch_id: string; raw: string; parsed: Omit<ParsedCard, "raw">; match_person_id: string | null; decision: string };
  if (row.decision !== "pending") throw new Error("already decided");
  const card: ParsedCard = { ...row.parsed, raw: row.raw };
  let personId: string | null = null;
  if (decision === "merge") {
    const target = into ?? row.match_person_id;
    if (!target) throw new Error("merge needs a person");
    personId = await materialiseCard(db, card, { batchId: row.batch_id, into: target });
  } else if (decision === "separate") {
    personId = await materialiseCard(db, card, { batchId: row.batch_id, tier: "contact" });
  }
  await db
    .from("people_import_candidates")
    .update({ decision: decision === "merge" ? "merged" : decision === "separate" ? "separate" : "skipped", decided_at: new Date().toISOString(), created_person_id: personId })
    .eq("id", candidateId);
  return { person_id: personId };
}
