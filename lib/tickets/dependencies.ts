/**
 * Ticket dependencies (tickets spec §3.2, §5): `ticket_dependencies` holds
 * (blocker_id, blocked_id). Lists read `blocked_by` through
 * lib/tickets/query.ts; this module is the other half, for one ticket's
 * page and for the API that writes the rows. Both directions are returned,
 * so a blocker shows what it holds up and a blocked ticket shows what it
 * waits for.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isClosedCategory } from "@/lib/tickets/categories";

export type DependencyTicket = {
  id: string;
  key: string | null;
  title: string;
  category: string | null;
  /** True when the other ticket is Done or Cancelled: it no longer holds anything up. */
  closed: boolean;
};

export type Dependencies = {
  /** Tickets this one waits for. */
  blocked_by: DependencyTicket[];
  /** Tickets this one holds up. */
  blocks: DependencyTicket[];
};

export type DependencyBody = { blocker?: unknown; blocks?: unknown };

/**
 * Which way the body points. `blocker: KEY` means "KEY blocks this ticket";
 * `blocks: KEY` means "this ticket blocks KEY". Exactly one is required.
 */
export function readDependencyBody(body: DependencyBody): { ok: true; other: string; direction: "blocker" | "blocks" } | { ok: false; error: string } {
  const blocker = typeof body.blocker === "string" ? body.blocker.trim() : "";
  const blocks = typeof body.blocks === "string" ? body.blocks.trim() : "";
  if (blocker && blocks) return { ok: false, error: "give blocker or blocks, not both" };
  if (blocker) return { ok: true, other: blocker, direction: "blocker" };
  if (blocks) return { ok: true, other: blocks, direction: "blocks" };
  return { ok: false, error: "blocker or blocks (a ticket key) is required" };
}

/** The row to insert for a ticket and the body's other ticket. */
export function dependencyRow(selfId: string, otherId: string, direction: "blocker" | "blocks"): { blocker_id: string; blocked_id: string } {
  return direction === "blocker" ? { blocker_id: otherId, blocked_id: selfId } : { blocker_id: selfId, blocked_id: otherId };
}

type TicketLite = {
  id: string;
  ticket_key: string | null;
  title: string;
  ticket_status: { category: string } | { category: string }[] | null;
};

function lite(t: TicketLite): DependencyTicket {
  const st = Array.isArray(t.ticket_status) ? t.ticket_status[0] : t.ticket_status;
  const category = st?.category ?? null;
  return { id: t.id, key: t.ticket_key, title: t.title, category, closed: isClosedCategory(category) };
}

/** Both directions for one ticket, as the caller may see them (RLS applies). */
export async function dependenciesFor(supabase: SupabaseClient, ticketId: string): Promise<Dependencies> {
  const { data: rows, error } = await supabase
    .from("ticket_dependencies")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${ticketId},blocked_id.eq.${ticketId}`);
  if (error) throw error;
  const deps = (rows ?? []) as Array<{ blocker_id: string; blocked_id: string }>;
  const otherIds = Array.from(new Set(deps.map((d) => (d.blocker_id === ticketId ? d.blocked_id : d.blocker_id))));
  if (otherIds.length === 0) return { blocked_by: [], blocks: [] };
  const { data: others, error: err2 } = await supabase
    .from("tickets")
    .select("id, ticket_key, title, ticket_status:ticket_statuses(category)")
    .in("id", otherIds);
  if (err2) throw err2;
  const byId = new Map((others ?? []).map((t) => [t.id as string, lite(t as unknown as TicketLite)]));
  const out: Dependencies = { blocked_by: [], blocks: [] };
  for (const d of deps) {
    if (d.blocked_id === ticketId) {
      const b = byId.get(d.blocker_id);
      if (b) out.blocked_by.push(b);
    } else {
      const b = byId.get(d.blocked_id);
      if (b) out.blocks.push(b);
    }
  }
  const byKey = (a: DependencyTicket, b: DependencyTicket) => (a.key ?? a.id).localeCompare(b.key ?? b.id, "en", { numeric: true });
  out.blocked_by.sort(byKey);
  out.blocks.sort(byKey);
  return out;
}
