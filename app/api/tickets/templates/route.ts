import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import {
  TEMPLATE_SELECT,
  definitionFromTicket,
  isTemplateDefinition,
  slugify,
  syncRepoTemplates,
  type TemplateDefinition,
} from "@/lib/tickets/templates";

export const runtime = "nodejs";

/** GET /api/tickets/templates — the caller's templates (personal + shared in the space). */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("ticket_templates")
      .select(TEMPLATE_SELECT)
      .order("origin")
      .order("name");
    if (error) throw error;
    return NextResponse.json({ templates: data ?? [] });
  } catch (err) {
    console.error("[/api/tickets/templates GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * POST /api/tickets/templates
 *   { name, definition, kind?, shared?, slug? }   — author from the UI
 *   { from_ticket: KEY, name, shared? }            — "Save as template"
 *   ?sync=1                                        — upsert the repo JSON templates
 */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;

    if (req.nextUrl.searchParams.get("sync") === "1") {
      const result = await syncRepoTemplates(supabase);
      return NextResponse.json(result);
    }

    const body = await readJson<{
      name?: string;
      definition?: unknown;
      kind?: string;
      shared?: boolean;
      slug?: string;
      from_ticket?: string;
    }>(req);
    if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });

    let definition: TemplateDefinition | null = null;
    if (typeof body.from_ticket === "string") {
      definition = await definitionFromTicket(supabase, body.from_ticket);
      if (!definition) return NextResponse.json({ error: "ticket not found" }, { status: 404 });
    } else if (isTemplateDefinition(body.definition)) {
      definition = body.definition;
    }
    if (!definition) return NextResponse.json({ error: "definition or from_ticket required" }, { status: 400 });

    const name = (typeof body.name === "string" ? body.name : definition.title).trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const base = slugify(typeof body.slug === "string" ? body.slug : name);

    // unique slug per space: suffix on collision
    const { data: taken } = await supabase.from("ticket_templates").select("slug").like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((r) => r.slug as string));
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;

    const { data, error } = await supabase
      .from("ticket_templates")
      .insert({
        slug,
        name,
        kind: typeof body.kind === "string" ? body.kind : definition.kind ?? "task",
        definition,
        shared: body.shared === true,
        origin: "ui",
      })
      .select(TEMPLATE_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/tickets/templates POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
