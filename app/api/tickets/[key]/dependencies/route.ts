import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { dependenciesFor, dependencyRow, readDependencyBody, type DependencyBody } from "@/lib/tickets/dependencies";
import { principalUid, readJson, resolveTicketRef, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * Dependencies between tickets (tickets spec §3.2, §5), both directions.
 *
 *   GET    /api/tickets/[key]/dependencies                  { blocked_by: [...], blocks: [...] }
 *   POST   /api/tickets/[key]/dependencies { blocker: KEY }  KEY blocks this ticket
 *   POST   /api/tickets/[key]/dependencies { blocks: KEY }   this ticket blocks KEY
 *   DELETE /api/tickets/[key]/dependencies?blocker=KEY | ?blocks=KEY
 *
 * A pair that already exists answers 200 with the current lists, so an
 * import can be run twice. A ticket cannot block itself, and a pair cannot
 * point both ways (the only cycle a single write can make).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(await dependenciesFor(supabase, ref.id));
  } catch (err) {
    console.error("[/api/tickets/:key/dependencies GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<DependencyBody>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const parsed = readDependencyBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const self = await resolveTicketRef(supabase, key);
    if (!self) return NextResponse.json({ error: "not found" }, { status: 404 });
    const other = await resolveTicketRef(supabase, parsed.other);
    if (!other) return NextResponse.json({ error: `No ticket "${parsed.other}".` }, { status: 404 });
    if (other.id === self.id) return NextResponse.json({ error: "A ticket cannot block itself." }, { status: 400 });
    if (other.space_id !== self.space_id) return NextResponse.json({ error: "Both tickets must be in the same space." }, { status: 400 });

    const row = dependencyRow(self.id, other.id, parsed.direction);
    const { data: reverse } = await supabase
      .from("ticket_dependencies")
      .select("blocker_id")
      .eq("blocker_id", row.blocked_id)
      .eq("blocked_id", row.blocker_id)
      .maybeSingle();
    if (reverse) return NextResponse.json({ error: "That would make the two tickets block each other." }, { status: 409 });

    const { error } = await supabase.from("ticket_dependencies").insert(row);
    if (error && error.code !== "23505") throw error;
    if (!error) {
      await supabase.from("ticket_activity").insert({
        ticket_id: self.id,
        action: "dependency",
        field: parsed.direction === "blocker" ? "blocked_by" : "blocks",
        from_value: null,
        to_value: parsed.other.slice(0, 200),
      });
    }
    return NextResponse.json(await dependenciesFor(supabase, self.id), { status: error ? 200 : 201 });
  } catch (err) {
    console.error("[/api/tickets/:key/dependencies POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const parsed = readDependencyBody({ blocker: req.nextUrl.searchParams.get("blocker") ?? undefined, blocks: req.nextUrl.searchParams.get("blocks") ?? undefined });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const self = await resolveTicketRef(supabase, key);
    if (!self) return NextResponse.json({ error: "not found" }, { status: 404 });
    const other = await resolveTicketRef(supabase, parsed.other);
    if (!other) return NextResponse.json({ error: `No ticket "${parsed.other}".` }, { status: 404 });
    const row = dependencyRow(self.id, other.id, parsed.direction);
    const { error } = await supabase.from("ticket_dependencies").delete().eq("blocker_id", row.blocker_id).eq("blocked_id", row.blocked_id);
    if (error) throw error;
    return NextResponse.json(await dependenciesFor(supabase, self.id));
  } catch (err) {
    console.error("[/api/tickets/:key/dependencies DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
