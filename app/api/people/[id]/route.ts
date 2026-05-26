import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { normaliseAlias } from "@/lib/people/normalise";
import type { Person, PersonAlias, PersonWithAliases } from "@/lib/people/types";

export const runtime = "nodejs";

const PERSON_FIELDS =
  "id, user_id, first_name, last_name, display_name, relationship, phone, email, birthday, address, where_we_met, mutual_interests, notes, needs_review, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { data: person } = await supabase
      .from("people")
      .select(PERSON_FIELDS)
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data: aliases } = await supabase
      .from("people_aliases")
      .select("id, person_id, alias, is_primary, created_at")
      .eq("person_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    const detail: PersonWithAliases = {
      ...(person as Person),
      aliases: (aliases ?? []) as PersonAlias[],
    };
    return NextResponse.json({ person: detail });
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
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  where_we_met: string | null;
  mutual_interests: string | null;
  notes: string | null;
  needs_review: boolean;
}>;

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of Object.keys(body) as (keyof PatchBody)[]) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  try {
    const supabase = createServerClient();
    const { data: existing } = await supabase
      .from("people")
      .select("id, first_name, display_name")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("people")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(PERSON_FIELDS)
      .single();
    if (error || !data) {
      console.error("[/api/people/:id PATCH]", error);
      return NextResponse.json({ error: "update failed" }, { status: 500 });
    }

    // If first_name or display_name changed, update the primary alias to match.
    const newPrimary = normaliseAlias(
      (body.display_name as string | null | undefined) ??
        (data as Person).display_name ??
        (body.first_name as string | undefined) ??
        (data as Person).first_name
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

    return NextResponse.json({ person: data as Person });
  } catch (err) {
    console.error("[/api/people/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("people")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/people/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
