import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  UI_PREFS_DEFAULTS,
  type UiPrefs,
} from "@/lib/settings/uiPrefs";

export const runtime = "nodejs";

const UID = () => process.env.USER_ID ?? "default";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("ui_prefs")
      .eq("user_id", UID())
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    const stored = (data?.ui_prefs ?? {}) as Partial<UiPrefs>;
    return NextResponse.json({ ...UI_PREFS_DEFAULTS, ...stored });
  } catch (err) {
    console.error("[settings/ui-prefs GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const partial = (await req.json()) as Partial<UiPrefs>;
    if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data: existing } = await supabase
      .from("user_settings")
      .select("ui_prefs")
      .eq("user_id", UID())
      .maybeSingle();
    const current = (existing?.ui_prefs ?? {}) as Partial<UiPrefs>;
    const merged = { ...current, ...partial };
    const { error } = await supabase
      .from("user_settings")
      .update({ ui_prefs: merged, updated_at: new Date().toISOString() })
      .eq("user_id", UID());
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ...UI_PREFS_DEFAULTS, ...merged });
  } catch (err) {
    console.error("[settings/ui-prefs PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
