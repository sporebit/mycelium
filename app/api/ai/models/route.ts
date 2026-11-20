import { NextResponse } from "next/server";
import { getOwnProfile } from "@/lib/auth/session";
import { PRICED, pinnedByEnv } from "@/lib/config/models";
import { refreshAiModels } from "@/lib/system/aiModels";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * GET /api/ai/models (MYC-190). For anyone signed in: the priced models
 * Settings may offer and the models the code is pinned to. For the
 * instance owner also the live list (ai_models, 0177) with first-seen,
 * last-seen and retired; RLS answers nobody else.
 *
 * POST /api/ai/models — the owner runs today's refresh now, the same as
 * the daily tick would, and gets its report. Used by the live check.
 */
export async function GET() {
  const profile = await getOwnProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const base = { priced: PRICED, in_use: pinnedByEnv() };
  if (!profile.is_instance_owner) return NextResponse.json({ ...base, models: null });
  const supabase = await createUserClient();
  const { data, error } = await supabase.from("ai_models").select("provider, model_id, display_name, released_at, first_seen, last_seen, retired_at").order("provider").order("model_id").limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...base, models: data ?? [] });
}

export async function POST() {
  const profile = await getOwnProfile();
  if (!profile?.is_instance_owner) return NextResponse.json({ error: "Unauthorized" }, { status: profile ? 403 : 401 });
  try {
    return NextResponse.json(await refreshAiModels());
  } catch (err) {
    console.error("[ai/models POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
