import { NextRequest, NextResponse } from "next/server";
import { resolvePendingRoute } from "@/lib/fitness/voice-route";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

type Body = {
  resolution?: "active" | "planned" | "new_extra";
  session_id?: string | null;
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const resolution = body.resolution;
  if (resolution !== "active" && resolution !== "planned" && resolution !== "new_extra") {
    return NextResponse.json({ error: "invalid resolution" }, { status: 400 });
  }

  try {
    const result = await resolvePendingRoute(
      await createUserClient(),
      id,
      resolution,
      body.session_id ?? null
    );
    if (!result) {
      return NextResponse.json(
        { error: "pending not found or expired" },
        { status: 404 }
      );
    }
    return NextResponse.json({ routed: result, summary: result.summary });
  } catch (err) {
    console.error("[pending-routes/:id/resolve]", err);
    return NextResponse.json({ error: "resolve failed" }, { status: 500 });
  }
}
