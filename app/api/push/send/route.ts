import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { sendToUser, type PushPayload } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: PushPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title || !body.body) {
    return NextResponse.json({ error: "title and body required" }, { status: 400 });
  }

  const supabase = await createUserClient();
  const result = await sendToUser(supabase, body);

  return NextResponse.json(result);
}
