import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { normaliseAlias } from "@/lib/people/normalise";
import { applyPersonPatch, attachContactPoints, PERSON_SELECT, resolvePersonId, softDeletePerson } from "@/lib/people/contacts";
import type { Person, PersonAlias, PersonWithAliases } from "@/lib/people/types";

export const runtime = "nodejs";

/**
 * GET /api/people/[id] — the person with aliases, numbers and emails. An id
 * that was merged away resolves to the survivor (people-contacts C3) and
 * the response says so in `resolved_from`; a deleted one is 404 (C4).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolvePersonId(supabase, rawId);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const id = ref.id;
    const { data: person } = await supabase
      .from("people")
      .select(PERSON_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data: aliases } = await supabase
      .from("people_aliases")
      .select("id, person_id, alias, is_primary, created_at")
      .eq("person_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    const [withPoints] = await attachContactPoints(supabase, [person as Person]);
    const detail: PersonWithAliases = {
      ...withPoints,
      aliases: (aliases ?? []) as PersonAlias[],
    };
    return NextResponse.json({ person: detail, resolved_from: ref.resolvedFrom });
  } catch (err) {
    console.error("[/api/people/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type PatchBody = Partial<{
  first_name: string;
  last_name: string | null;
  display_name: string | null;
  relationship: string | null;
  /** Legacy single values: become contact points (0140). */
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  where_we_met: string | null;
  mutual_interests: string | null;
  notes: string | null;
  needs_review: boolean;
  /** Optional secondary aliases — primary alias is auto-managed
   *  from first_name / display_name below. Setting an empty array
   *  clears every non-primary alias. */
  aliases: string[];
}>;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const ref = await resolvePersonId(supabase, rawId);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const id = ref.id;

    const data = await applyPersonPatch(supabase, id, body as Record<string, unknown>);
    if (!data) {
      console.error("[/api/people/:id PATCH] update failed");
      return NextResponse.json({ error: "update failed" }, { status: 500 });
    }

    // If first_name or display_name changed, update the primary alias to match.
    const newPrimary = normaliseAlias(
      (body.display_name as string | null | undefined) ??
        data.display_name ??
        (body.first_name as string | undefined) ??
        data.first_name
    );
    if (newPrimary) {
      const { data: primary } = await supabase
        .from("people_aliases")
        .select("id, alias")
        .eq("person_id", id)
        .eq("is_primary", true)
        .maybeSingle();
      if (primary?.id && primary.alias !== newPrimary) {
        // Check uniqueness — if newPrimary already exists as a non-primary alias,
        // promote it; otherwise rename in place.
        const { data: existingAlias } = await supabase
          .from("people_aliases")
          .select("id")
          .eq("person_id", id)
          .ilike("alias", newPrimary)
          .maybeSingle();
        if (existingAlias?.id) {
          await supabase
            .from("people_aliases")
            .update({ is_primary: false })
            .eq("id", primary.id);
          await supabase
            .from("people_aliases")
            .update({ is_primary: true })
            .eq("id", existingAlias.id);
        } else {
          await supabase
            .from("people_aliases")
            .update({ alias: newPrimary })
            .eq("id", primary.id);
        }
      }
    }

    // Sync secondary aliases when the caller sent an explicit array.
    // We diff against existing non-primary aliases so adds, removes,
    // and renames all converge in a single call.
    if (Array.isArray(body.aliases)) {
      const next = new Set(
        body.aliases
          .map((a) => normaliseAlias(a))
          .filter((a): a is string => !!a),
      );
      const { data: existingAliases } = await supabase
        .from("people_aliases")
        .select("id, alias, is_primary")
        .eq("person_id", id);
      const removeIds: string[] = [];
      const keep = new Set<string>();
      for (const row of (existingAliases ?? []) as Array<{
        id: string;
        alias: string;
        is_primary: boolean;
      }>) {
        if (row.is_primary) continue;
        if (next.has(row.alias)) {
          keep.add(row.alias);
        } else {
          removeIds.push(row.id);
        }
      }
      if (removeIds.length > 0) {
        await supabase
          .from("people_aliases")
          .delete()
          .in("id", removeIds);
      }
      const toAdd = [...next].filter((a) => !keep.has(a));
      if (toAdd.length > 0) {
        await supabase
          .from("people_aliases")
          .insert(
            toAdd.map((alias) => ({
              person_id: id,
              alias,
              is_primary: false,
            })),
          );
      }
    }

    const [person] = await attachContactPoints(supabase, [data]);
    return NextResponse.json({ person });
  } catch (err) {
    console.error("[/api/people/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

/** DELETE — soft (the bin, people-contacts C4). `?hard=1` removes the row for good. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const hard = req.nextUrl.searchParams.get("hard") === "1";
  try {
    const supabase = await createUserClient();
    if (hard) {
      const { error } = await supabase.from("people").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, hard: true });
    }
    const ok = await softDeletePerson(supabase, id);
    if (!ok) return NextResponse.json({ error: "delete failed" }, { status: 500 });
    return NextResponse.json({ ok: true, deleted_at: new Date().toISOString() });
  } catch (err) {
    console.error("[/api/people/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
