import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();

    const { data: supplements, error: sErr } = await supabase
      .from("supplements")
      .select("*")
      .eq("user_id", uid)
      .eq("active", true)
      .order("name");
    if (sErr) throw sErr;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: logs, error: lErr } = await supabase
      .from("supplement_logs")
      .select("id, supplement_id, taken_at")
      .eq("user_id", uid)
      .gte("taken_at", today.toISOString())
      .order("taken_at", { ascending: false });
    if (lErr) throw lErr;

    const logsBySupp = new Map<string, { id: string; taken_at: string }[]>();
    for (const l of logs ?? []) {
      const arr = logsBySupp.get(l.supplement_id) ?? [];
      arr.push(l);
      logsBySupp.set(l.supplement_id, arr);
    }

    const enriched = (supplements ?? []).map((s) => ({
      ...s,
      today_logs: logsBySupp.get(s.id) ?? [],
    }));

    return NextResponse.json({ supplements: enriched });
  } catch (err) {
    console.error("[/api/supplements GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreatePayload = {
  name: string;
  brand?: string | null;
  dose: string;
  form?: string;
  schedule?: string | null;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: CreatePayload;
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.dose?.trim()) {
    return NextResponse.json(
      { error: "name + dose required" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("supplements")
      .insert({
        user_id: uid,
        name: body.name.trim(),
        brand: body.brand?.trim() || null,
        dose: body.dose.trim(),
        form: body.form?.trim() || "capsule",
        schedule: body.schedule?.trim() || null,
        notes: body.notes?.trim() || null,
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ supplement: { ...data, today_logs: [] } });
  } catch (err) {
    console.error("[/api/supplements POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
