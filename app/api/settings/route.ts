import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { updateUserSettings } from "@/lib/settings/userSettingsRow";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    if (!data) {
      const { data: created, error: createErr } = await supabase
        .from("user_settings")
        .insert({ display_name: "Phil" })
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
    const supabase = await createUserClient();
    const { data, error } = await updateUserSettings(supabase, body as Record<string, unknown>);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error("[settings PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
