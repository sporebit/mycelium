import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
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
      // A new person's settings start with THEIR name, taken from their profile (set when they joined).
      // Until 2026-11-20 this wrote "Phil" for everyone, so every new person was greeted as Phil.
      const { data: profile } = await supabase.from("profiles").select("display_name").limit(1).maybeSingle();
      const { data: created, error: createErr } = await supabase
        .from("user_settings")
        .insert({ display_name: (profile?.display_name as string | null)?.trim() || "" })
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
    // The name set here is also the name other people see (team lists, shared work, the rundown): keep the
    // profile in step. A person may change only their own profile's name (0102), so this is their row or none.
    const name = (body as { display_name?: unknown } | null)?.display_name;
    if (typeof name === "string" && name.trim()) {
      const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
      if (uid) {
        const { error: profileError } = await supabase.from("profiles").update({ display_name: name.trim().slice(0, 80) }).eq("id", uid);
        if (profileError) console.error("[settings PATCH] profile name not updated:", profileError.message);
      }
    }
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error("[settings PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
