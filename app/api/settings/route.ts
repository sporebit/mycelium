import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const UID = () => process.env.USER_ID ?? "default";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", UID())
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    if (!data) {
      const { data: created, error: createErr } = await supabase
        .from("user_settings")
        .insert({ user_id: UID(), display_name: "Phil" })
        .select()
        .single();
      if (createErr)
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      return NextResponse.json({ settings: created });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error("[settings GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("user_settings")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("user_id", UID())
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error("[settings PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
