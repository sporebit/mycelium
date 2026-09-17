import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import {
  linkRowFromBody,
  principalUid,
  readJson,
  resolveTicketRef,
  ticketWriteGate,
  type LinkInput,
} from "@/lib/tickets/server";

export const runtime = "nodejs";

const LINK_SELECT = "id, kind, ref, url, label, meta, at";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase
      .from("ticket_links")
      .select(LINK_SELECT)
      .eq("ticket_id", ref.id)
      .order("at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ links: data ?? [] });
  } catch (err) {
    console.error("[/api/tickets/:key/links GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * POST /api/tickets/[key]/links  { kind?, url?, ref?, label?, meta? }
 * Evidence / attachment / url (spec §11). `kind` defaults from the URL
 * (github commit → commit, pull → pr, vercel → deploy, else url).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<LinkInput>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const parsed = linkRowFromBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase
      .from("ticket_links")
      .insert({ ticket_id: ref.id, ...parsed.row })
      .select(LINK_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    await supabase.from("ticket_activity").insert({
      ticket_id: ref.id,
      action: "link",
      field: String(parsed.row.kind),
      from_value: null,
      to_value: String(parsed.row.url ?? parsed.row.ref ?? "").slice(0, 200),
    });
    return NextResponse.json({ link: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/tickets/:key/links POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}

/** DELETE ?id=<link id> — remove one link. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { error } = await supabase
      .from("ticket_links")
      .delete()
      .eq("id", id)
      .eq("ticket_id", ref.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tickets/:key/links DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
