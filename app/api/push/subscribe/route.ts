import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { upsertSubscription } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Missing endpoint, keys.p256dh, or keys.auth" },
      { status: 400 },
    );
  }

  const supabase = await createUserClient();
  const result = await upsertSubscription(supabase, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
