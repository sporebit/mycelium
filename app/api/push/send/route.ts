import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendToUser, type PushPayload } from "@/lib/push";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: PushPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title || !body.body) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await sendToUser(supabase, uid, body);

  return NextResponse.json(result);
}
