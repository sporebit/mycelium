import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import {
  TEMPLATE_SELECT,
  instantiateTemplate,
  isTemplateDefinition,
  type TemplateRow,
} from "@/lib/tickets/templates";

export const runtime = "nodejs";

async function load(supabase: Awaited<ReturnType<typeof createUserClient>>, slug: string): Promise<TemplateRow | null> {
  const { data } = await supabase.from("ticket_templates").select(TEMPLATE_SELECT).eq("slug", slug).maybeSingle();
  return (data as TemplateRow | null) ?? null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const tpl = await load(supabase, slug);
    if (!tpl) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ template: tpl });
  } catch (err) {
    console.error("[/api/tickets/templates/:slug GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** PATCH { name?, definition?, shared?, kind? } — bumps version. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<{ name?: string; definition?: unknown; shared?: boolean; kind?: string }>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const tpl = await load(supabase, slug);
    if (!tpl) return NextResponse.json({ error: "not found" }, { status: 404 });
    const update: Record<string, unknown> = { updated_at: new Date().toISOString(), version: tpl.version + 1 };
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (body.definition !== undefined) {
      if (!isTemplateDefinition(body.definition)) return NextResponse.json({ error: "bad definition" }, { status: 400 });
      update.definition = body.definition;
    }
    if (typeof body.shared === "boolean") update.shared = body.shared;
    if (typeof body.kind === "string") update.kind = body.kind;
    if (tpl.origin === "repo") update.origin = "ui"; // edited in the UI → UI owns it from now on
    const { data, error } = await supabase.from("ticket_templates").update(update).eq("id", tpl.id).select(TEMPLATE_SELECT).single();
    if (error || !data) throw error ?? new Error("update failed");
    return NextResponse.json({ template: data });
  } catch (err) {
    console.error("[/api/tickets/templates/:slug PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { error } = await supabase.from("ticket_templates").delete().eq("slug", slug);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tickets/templates/:slug DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}

/** POST { title?, project_id?, category?, vars? } — "New from template". Returns the ticket and its key. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const uid = await principalUid();
  const body =
    (await readJson<{ title?: string; project_id?: string | null; category?: "inbox" | "next" | "backlog"; vars?: Record<string, string> }>(req)) ?? {};
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const tpl = await load(supabase, slug);
    if (!tpl) return NextResponse.json({ error: "not found" }, { status: 404 });
    const ticket = await instantiateTemplate(supabase, tpl, {
      uid,
      title: typeof body.title === "string" ? body.title : undefined,
      project_id: body.project_id ?? undefined,
      category: body.category,
      vars: body.vars,
    });
    return NextResponse.json({ ticket, key: ticket.ticket_key }, { status: 201 });
  } catch (err) {
    console.error("[/api/tickets/templates/:slug POST]", err);
    return NextResponse.json({ error: "instantiate failed" }, { status: 500 });
  }
}
