import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { listTeams, rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

/** Teams the caller can see (member or owner), with their role. */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createUserClient();
  try {
    return NextResponse.json({ teams: await listTeams(db, me.id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/** Create a team; the caller becomes its owner and a team space is created. */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; slug?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const slug = typeof body.slug === "string" && body.slug ? slugify(body.slug) : slugify(name);
  if (slug.length < 2) return NextResponse.json({ error: "slug too short" }, { status: 400 });

  const db = await createUserClient();
  const { data, error } = await db.rpc("create_team", { p_name: name, p_slug: slug });
  if (error) {
    const status = /duplicate key|teams_slug_key/.test(error.message) ? 409 : 400;
    return NextResponse.json({ error: rpcMessage(error) }, { status });
  }
  return NextResponse.json({ id: data, slug }, { status: 201 });
}
