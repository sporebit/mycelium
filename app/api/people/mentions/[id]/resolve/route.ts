import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { normaliseAlias } from "@/lib/people/normalise";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type Body = { person_id?: string | null; create_alias?: boolean };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: mentionId } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const personId = body.person_id ?? null;
  if (!personId) {
    return NextResponse.json({ error: "person_id required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { data: mention } = await supabase
      .from("people_mentions")
      .select("id, raw_alias, person_id")
      .eq("id", mentionId)
      .eq("user_id", uid)
      .maybeSingle();
    if (!mention) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const m = mention as { id: string; raw_alias: string; person_id: string | null };

    const { error } = await supabase
      .from("people_mentions")
      .update({
        person_id: personId,
        confidence: "high",
        needs_review: false,
        resolved_at: new Date().toISOString(),
        candidate_person_ids: null,
      })
      .eq("id", mentionId);
    if (error) {
      console.error("[resolve mention]", error);
      return NextResponse.json({ error: "resolve failed" }, { status: 500 });
    }

    // If the resolution's raw_alias isn't already registered to this person, add it.
    if (body.create_alias !== false) {
      const alias = normaliseAlias(m.raw_alias);
      if (alias) {
        const { data: existing } = await supabase
          .from("people_aliases")
          .select("id")
          .eq("person_id", personId)
          .ilike("alias", alias)
          .maybeSingle();
        if (!existing?.id) {
          await supabase
            .from("people_aliases")
            .insert({ person_id: personId, alias, is_primary: false });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[resolve mention]", err);
    return NextResponse.json({ error: "resolve failed" }, { status: 500 });
  }
}
