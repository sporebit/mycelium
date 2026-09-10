import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";
import { normaliseAlias } from "@/lib/people/normalise";
import type { PersonAlias } from "@/lib/people/types";

export const runtime = "nodejs";

async function ensureOwned(
  supabase: SupabaseClient,
  personId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .maybeSingle();
  return !!data?.id;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: personId } = await ctx.params;
  let body: { alias?: string };
  try {
    body = (await req.json()) as { alias?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const alias = normaliseAlias(body.alias ?? "");
  if (!alias) return NextResponse.json({ error: "alias required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    if (!(await ensureOwned(supabase, personId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const { data, error } = await supabase
      .from("people_aliases")
      .insert({ person_id: personId, alias, is_primary: false })
      .select("id, person_id, alias, is_primary, created_at")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "alias already exists for this person" },
          { status: 409 }
        );
      }
      console.error("[aliases POST]", error);
      return NextResponse.json({ error: "create failed" }, { status: 500 });
    }
    return NextResponse.json({ alias: data as PersonAlias });
  } catch (err) {
    console.error("[aliases POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
