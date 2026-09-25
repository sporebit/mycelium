import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { normaliseAlias } from "@/lib/people/normalise";
import { addEmail, addPhone } from "@/lib/people/contacts";
import type { ImportResult, PersonImport } from "@/lib/people/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { people?: PersonImport[] };

export async function POST(req: NextRequest) {

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(body.people)) {
    return NextResponse.json({ error: "people array required" }, { status: 400 });
  }

  const supabase = await createUserClient();
  const today = new Date().toISOString().slice(0, 10);
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < body.people.length; i++) {
    const p = body.people[i];
    const first = (p.first_name ?? "").trim();
    const last = (p.last_name ?? "")?.trim() || null;
    if (!first) {
      result.skipped += 1;
      result.errors.push({ index: i, reason: "first_name required" });
      continue;
    }
    try {
      // Match by first + last (last_name nullable)
      let q = supabase
        .from("people")
        .select("id, last_name, birthday, address, relationship, notes")
        .is("deleted_at", null)
        .ilike("first_name", first);
      q = last ? q.ilike("last_name", last) : q.is("last_name", null);
      const { data: existing } = await q.maybeSingle();
      type Row = {
        id: string;
        last_name: string | null;
        phone: string | null;
        email: string | null;
        birthday: string | null;
        address: string | null;
        relationship: string | null;
        notes: string | null;
      };
      const row = existing as Row | null;

      if (row?.id) {
        // Merge — only fill blanks, don't overwrite
        const update: Record<string, unknown> = {};
        if (p.phone) await addPhone(supabase, row.id, { number_raw: p.phone });
        if (p.email) await addEmail(supabase, row.id, { email: p.email });
        if (!row.birthday && p.birthday) update.birthday = p.birthday;
        if (!row.address && p.address) update.address = p.address;
        if (!row.relationship && p.relationship) update.relationship = p.relationship;
        if (Object.keys(update).length === 0) {
          result.skipped += 1;
          continue;
        }
        update.updated_at = new Date().toISOString();
        await supabase.from("people").update(update).eq("id", row.id);
        result.updated += 1;
        continue;
      }

      // Create new — body notes append "Imported via bulk on YYYY-MM-DD"
      const importNote = `Imported via bulk on ${today}`;
      const { data: created, error: createErr } = await supabase
        .from("people")
        .insert({ first_name: first,
          last_name: last,
          birthday: p.birthday ?? null,
          address: p.address ?? null,
          relationship: p.relationship ?? null,
          notes: importNote,
          needs_review: false,
        })
        .select("id")
        .single();
      if (createErr || !created) {
        result.skipped += 1;
        result.errors.push({ index: i, reason: createErr?.message ?? "insert failed" });
        continue;
      }
      const personId = created.id as string;
      if (p.phone) await addPhone(supabase, personId, { number_raw: p.phone });
      if (p.email) await addEmail(supabase, personId, { email: p.email });

      // Aliases: first, "first last", last (last as non-primary)
      const aliases = new Set<string>();
      const firstAlias = normaliseAlias(first);
      aliases.add(firstAlias);
      if (last) {
        aliases.add(normaliseAlias(`${first} ${last}`));
        aliases.add(normaliseAlias(last));
      }
      const aliasRows = Array.from(aliases).map((alias) => ({
        person_id: personId,
        alias,
        is_primary: alias === firstAlias,
      }));
      await supabase.from("people_aliases").insert(aliasRows);
      result.created += 1;
    } catch (err) {
      result.skipped += 1;
      result.errors.push({
        index: i,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json(result);
}
