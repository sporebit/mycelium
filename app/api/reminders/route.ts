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
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", uid)
      .eq("cancelled", false)
      .order("due_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ reminders: data ?? [] });
  } catch (err) {
    console.error("[/api/reminders GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreatePayload = {
  message: string;
  due_at: string;
  recurrence?: string | null;
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

  if (!body.message?.trim() || !body.due_at) {
    return NextResponse.json(
      { error: "message + due_at required" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("reminders")
      .insert({
        user_id: uid,
        message: body.message.trim(),
        due_at: body.due_at,
        recurrence: body.recurrence?.trim() || null,
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ reminder: data });
  } catch (err) {
    console.error("[/api/reminders POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
